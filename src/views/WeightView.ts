import {
    App,
    TFile,
    Modal,
    Setting,
} from 'obsidian';

import * as templates from '../templates';

import { DateTime } from 'luxon';
import { Eta }      from 'eta';
import { Chart }    from 'chart.js/auto';
import zoomPlugin   from 'chartjs-plugin-zoom';
import 'chartjs-adapter-luxon';

Chart.register(zoomPlugin);



/**
 *
 *
 */
export default class WeightView {


    /**
     *
     *
     **/
    constructor(app, source: string, container: HTMLElement) {
        this.container = container;
        this.app = app;
        this.logFile = this.app.vault.getAbstractFileByPath('Health & Fitness/Logs/Weight.csv') as TFile;

        this.eta = new Eta();
        this.eta.loadTemplate("@view", templates.WeightView);
        this.eta.loadTemplate("@add", templates.Add);
    }


    /**
     *
     *
     **/
    async handleAddClick(event:MouseEvent) {
        new class extends Modal {
            result: string;
            onSubmit: (result: string) => void;

            constructor(app: App, previousWeight, onSubmit: (result: string) => void) {
                super(app);
                this.onSubmit = onSubmit;
                this.previousWeight = previousWeight;
            }

            onOpen() {
                this.setTitle("Enter Weight");
                const { contentEl } = this;
                const input = contentEl.createEl("input", {type: "number", cls: "weight-input", placeholder: this.previousWeight});
                contentEl.addEventListener("keypress", _ => {
                    if (_.key == 'Enter') {
                        const value = contentEl.querySelector('input').value;
                        this.close();
                        if (value) this.onSubmit(Number(value).toFixed(1));
                    }
                });
                input.focus();
            }

            onClose() {
                let { contentEl } = this;
                contentEl.empty();
            }
        }(this.app, 186.5, (value) => {

            let timestamp = DateTime.now().toISO();
            let output = `${timestamp},${value}\n`

            // Append new data to end of log file
            this.app.vault.append(this.logFile, output);
        }).open();
    }


    /**
     * TODO: we should cache somehow; only read in new data
     *
     *
     **/
    async loadData(start, end, groupBy = null) {

        // Read in log files into strings
        // & split into a list of records
        const dataString = (await this.app.vault.cachedRead(this.logFile));
        let data = dataString.trim().split('\n');

        // Find the starting record using binary search. Because
        // the timestamp is stored using ISO-8601, lexicographical
        // order equals chronological order, so we can compare
        // strings directly. Once we find the start, slice the
        // array to ignore the unneeded earlier records.
        const needle = start.toISO();
        var index;
        let upper = data.length-1;
        let lower = 0;
        while (lower <= upper) {
            index = Math.floor((upper+lower)/2);
            upper = needle < data[index] ? index-1 : upper;
            lower = needle > data[index] ? index+1 : lower;
        }
        data = data.slice(index);

        // Tansform data
        // ?????
        let acc = {}
        for (const row of data) {

            // Extract timestamp & value from "timestamp,value".
            // We can use split because we always know that
            // timestamp will be the first column & value will
            // be the second column; always delimited by a comma.
            // Also there will never be a header to skip.
            let [timestamp, value] = row.trim().split(',');

            // Convert data types & get derived variables
            timestamp = DateTime.fromISO(timestamp);
            value = Number(value);

            // TODO: switch on "groupBy" to determine the key
            const date = timestamp.startOf('day');
            const key = date.valueOf();

            // If this is the first time seeing this particular
            // key, create a default record that we can update.
            if (acc[key] == undefined) {
                acc[key] = {
                    'key': key,
                    'min': Infinity,
                    'max': -Infinity,
                    'mean': 0,
                    'count': 0,
                    'values': [],
                }
            }

            // Update the various fields of the record
            acc[key].min = Math.min(acc[key].min, value);
            acc[key].max = Math.max(acc[key].max, value);
            acc[key].values.push(value);
            acc[key].count++;
            acc[key].mean += (value-acc[key].mean)/acc[key].count;
        }
        data = Object.values(acc)

        // TODO: time weighted average
        //
        // let mean = Math.round(10* record.rows.weight.array().reduce((a,b) => a+b) / record.rows.length) / 10;
        //
        // let sum = 0;
        // let test = record
        //     .rows
        //     .array()
        // test.reduce((_a, _b, i, data) => {
        //         sum += (data[i].timestamp.diff(data[i-1].timestamp))*(data[i-1].weight + data[i].weight)/2.0
        //     })
        // if (test.length > 1) {
        //     mean = sum / (test[test.length-1].timestamp.diff(test[0].timestamp))
        // }

        const weightDataMax    = data.map(_ => ({'x': DateTime.fromMillis(_.key), 'y': _.max}))
        const weightDataMean   = data.map(_ => ({'x': DateTime.fromMillis(_.key), 'y': _.mean}))
        const weightDataMin    = data.map(_ => ({'x': DateTime.fromMillis(_.key), 'y': _.min}))

        this.chart.data.datasets[0].data = weightDataMean;
        this.chart.data.datasets[1].data = weightDataMax;
        this.chart.data.datasets[2].data = weightDataMin;
        this.chart.update();
    }


    /**
     *
     **/
    async onPanZoomComplete({chart}) {
        let min = DateTime.fromMillis(chart.options.scales.x.min)
        let max = DateTime.fromMillis(chart.options.scales.x.max)
        const margin = Math.round(max.diff(min).as('days'));
        this.loadData(min.minus({days: margin}), max.plus({days: margin}));
    }

    
    /**
     * Callback function Obsidian invokes to render HTML.
     *
     * This function is responsible to registering event listeners
     * and using the Eta template to render the top level HTML.
     **/
    async processMarkdown() {

        this.container.innerHTML = this.eta.render("@view", {});

        const button = this.container.querySelector('.add-button');
        button.addEventListener("click", this.handleAddClick.bind(this));
        
        const ctx = this.container.querySelector('canvas');
        this.chart = new Chart(ctx, {
                  type: 'line',
                  data: {
                      datasets: [
                          {data: []},
                          {data: [], radius: 0, fill: '+1'},
                          {data: [], radius: 0},
                      ],
                  },
                  options: {
                      animations: false,  // https://www.chartjs.org/docs/latest/configuration/animations.html
                      elements: {         // https://www.chartjs.org/docs/3.9.1/configuration/elements.html
                          line: {         // https://www.chartjs.org/docs/3.9.1/configuration/elements.html#line-configuration
                              borderWidth: 1,
                              tension: 0,  // zero means straight lines
                              cubicInterpolationMode: 'monotone',
                              borderColor: [
                                  'rgb(75, 192, 192)',
                                  'rgba(75, 192, 192, 0.10)',
                                  'rgba(75, 192, 192, 0.10)',
                              ],
                              backgroundColor: [
                                  'rgba(75, 192, 192, 0.10)',
                                  'rgba(75, 192, 192, 0.10)',
                                  'rgba(75, 192, 192, 0.10)',
                              ],
                          },
                      },
                      scales: {
                          x: {
                              type: 'time',
                              min: DateTime.now().minus({weeks: 2}).toISO(),
                              max: DateTime.now().toISO(),
                              time: {minUnit: 'day'},
                              ticks: {
                                  minRotation: 60,
                              },
                              display: true,
                          },
                          y: {
                              display: true,
                              ticks: {
                                  stepSize: 1,
                              }
                          }
                      },
                      plugins: {
                          legend: {  // https://www.chartjs.org/docs/latest/configuration/legend.html
                              display: false,
                          },

                          // https://www.chartjs.org/chartjs-plugin-zoom/guide/options.html
                          zoom: {
                              pan: {
                                  enabled: true,
                                  mode: 'x',
                                  onPanComplete: this.onPanZoomComplete.bind(this),
                              },
                              zoom: {
                                  wheel: {enabled: true, speed: 0.1, modifierKey: 'shift'},
                                  pinch: {enabled: true, speed: 0.1},
                                  mode: 'x',
                                  onZoomComplete: this.onPanZoomComplete.bind(this),
                              },
                          },
                      }
                  },
        });

        this.loadData(DateTime.now().minus({weeks: 10}), DateTime.now().plus({days: 1}));
        this.app.vault.on('modify', file => {
            if (file = this.logFile) this.loadData(DateTime.now().minus({weeks: 2}), DateTime.now().plus({days: 1}));
        });
    }
}

