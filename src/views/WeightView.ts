import {
    App,
    TFile,
    Modal,
    Setting,
} from 'obsidian';

import * as templates from '../templates';

import { Eta } from 'eta';
import {parse} from 'csv-parse/browser/esm/sync';

import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-luxon';

Chart.register(zoomPlugin);

import {DateTime} from 'luxon';

const DATE_FORMAT_LOG = 'yyyy-LL-dd hh:mm a'


/**
 * A helper function for grouping an array of objects by a specific key.
 *
 * Example:
 *    [
 *        {a: 1, b: 2},
 *        {a: 1, b: 3},
 *        {a: 2, b, 4},
 *    ].groupBy('a');
 * returns:
 *    {
 *        1: [
 *            {a: 1, b: 2},
 *            {a: 1, b: 3},
 *        ],
 *        2: [
 *            {a: 2, b, 4},
 *        ],
 *    }
 */
Array.prototype.groupBy = function(key) {
    return this.reduce((acc, val) => {  // groupBy
        (acc[val[key]] = acc[val[key]] || []).push(val);
        return acc;
    }, {})
}


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
        this.eta.loadTemplate("@toml", templates.WeightToml);
    }



    /**
     *
     *
     **/
    async handleAddClick(event:MouseEvent) {
        new ExampleModal(this.app, 186.5, (value) => {

            let timestamp = DateTime.now().toISO();
            let output = `${timestamp},${value}\n`

            // Append new data to end of log file
            this.app.vault.append(this.logFile, output);
        }).open();
    }


    /**
     *
     *
     *
     **/
    async loadData() {

        // Read in weight data

        const dataString = (await this.app.vault.cachedRead(this.logFile))
        let data = parse(dataString, {columns: true, skip_empty_lines: true})
            .reduce((acc, row) => {
                // Convert data types & get derived variables
                const timestamp = DateTime.fromISO(row.timestamp);
                const value = row.value;
                const date = timestamp.startOf('day');
                const time = timestamp.toISOTime();

                (acc[date] = acc[date] || []).push({
                    'timestamp': timestamp,
                    'date': date,
                    'time': time,
                    'value': Number(value)
                });
                return acc;
            }, {});
        console.log(data);

        data = Object.entries(data)
            .map(record => {
                let date = record[1][0].date;
                let min = Math.min(...record[1].map(_ => _.value));
                let max = Math.max(...record[1].map(_ => _.value));
                let mean = min+(max-min)/2;

                return {
                    'date': date,
                    'mean': mean,
                    'min': min,
                    'max': max,
                    'data': record[1],
                    'test': record[1].map(_ => _.value)
                }
            });
        
        // let date = record.key;
        // let min = Math.min(...record.rows.weight);
        // let mean = Math.round(10* record.rows.weight.array().reduce((a,b) => a+b) / record.rows.length) / 10;
        // let max = Math.max(...record.rows.weight);
        //
        // // TODO: use a time weighted average
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


        // TODO: have multiple datasets so we can get smoother graphs (mean/min/max over larger time periods)
        const weightDataLabels = data.map(_ => _.date)
        const weightDataMax    = data.map(_ => ({'x': _.date, 'y': _.max}))
        const weightDataMean   = data.map(_ => ({'x': _.date, 'y': _.mean}))
        const weightDataMin    = data.map(_ => ({'x': _.date, 'y': _.min}))

        this.chart.data.datasets[0].data = weightDataMean;
        this.chart.data.datasets[1].data = weightDataMax;
        this.chart.data.datasets[2].data = weightDataMin;
        this.chart.update();
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
                      // labels: weightDataLabels,
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
                              },
                              zoom: {
                                  wheel: {enabled: true, speed: 0.1, modifierKey: 'shift'},
                                  pinch: {enabled: true, speed: 0.1},
                                  mode: 'x',
                                  onZoomComplete({chart}) {



                                      let min = DateTime.fromMillis(chart.options.scales.x.min)
                                      let max = DateTime.fromMillis(chart.options.scales.x.max)
                                      let diff = Math.round(max.diff(min).as('days'))

                                      // if (diff > 300) {
                                      //     chart.options.scales.x.time.unit = 'year'
                                      // } else if (diff > 90) {
                                      //     chart.options.scales.x.time.unit = 'month'
                                      // } else {
                                      //     chart.options.scales.x.time.unit = 'day'
                                      // }
                                      // console.log(diff.as('days'))
                                      chart.update('none');
                                  },
                              },
                          },
                      }
                  },
        });

        this.loadData();
        this.app.vault.on('modify', file => {
            if (file = this.logFile) this.loadData();
        });
    }
}


export class ExampleModal extends Modal {
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
    contentEl.createEl("input", {type: "number", cls: "weight-input", placeholder: this.previousWeight});
    contentEl.addEventListener("keypress", _ => {
        if (_.key == 'Enter') {
            const value = contentEl.querySelector('input').value;
            this.close();
            if (value) this.onSubmit(Number(value).toFixed(1));
        }
    });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}
