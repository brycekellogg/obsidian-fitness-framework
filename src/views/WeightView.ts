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

        // ???
        new class extends Modal {

            // ???
            constructor(app: App, logFile: TFile) {
                super(app);
                this.logFile = logFile;
                this.setTitle("Enter Weight");
            }

            // ???
            onOpen() {
                const input = this.contentEl.createEl("input", {type: "number", cls: "weight-input"});
                input.focus();
                input.addEventListener("keypress", ({key, target}) => {
                    if (key == 'Enter') {
                        this.app.vault.append(this.logFile, `${DateTime.now().toISO()},${target.value}\n`);
                        this.close();
                    }
                });
            }

            // Gets called when we click "x" or press Esc
            onClose() { this.contentEl.empty() }

        }(this.app, this.logFile).open();
    }


    /**
     * TODO: we should cache somehow; only read in new data
     *
     *
     **/
    async loadData() {

        // ???
        let min = DateTime.fromMillis(this.chart.options.scales.x.min)
        let max = DateTime.fromMillis(this.chart.options.scales.x.max)
        const margin = Math.round(max.diff(min).as('days'));
        const groupBy = 1 + Math.floor(margin / 100);

        
        const start = min.minus({days: margin});

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
            // timestamp.ordinal is 1-indexed, so we need to subtract by one
            // or else dates show up one day later than expected
            const date = Math.floor(timestamp.ordinal / groupBy)*groupBy - 1;
            const key = timestamp.startOf('year').plus({days: date}).valueOf();

            // If this is the first time seeing this particular
            // key, create a default record that we can update.
            if (acc[key] == undefined) {
                acc[key] = {
                    lastTimestamp: timestamp,
                    firstTimestamp: timestamp,
                    lastValue: value,
                    key: key,
                    min: value,
                    max: value,
                    mean: value,
                    count: 1,
                    values: [value],
                    weightedMean: value,
                    weightedDt: 0,
                }
            } else {

                // Update the various fields of the record
                acc[key].min = Math.min(acc[key].min, value);
                acc[key].max = Math.max(acc[key].max, value);
                acc[key].values.push(value);
                acc[key].count++;
                acc[key].mean += (value-acc[key].mean)/acc[key].count;

                // Calculate time weighted mean
                const dvi = (acc[key].lastValue + value) / 2;
                const dti = timestamp.diff(acc[key].lastTimestamp).as('seconds');
                
                acc[key].weightedMean *= acc[key].weightedDt;
                acc[key].weightedMean += dvi*dti;
                acc[key].weightedDt += dti;
                acc[key].weightedMean /= acc[key].weightedDt;

                acc[key].lastValue = value;
                acc[key].lastTimestamp = timestamp;
            }
        }

        data = Object.values(acc)

        this.chart.data.datasets[0].data = data.map(_ => ({'x': DateTime.fromMillis(_.key), 'y': _.max}));
        this.chart.data.datasets[1].data = data.map(_ => ({'x': DateTime.fromMillis(_.key), 'y': _.weightedMean}));
        this.chart.data.datasets[2].data = data.map(_ => ({'x': DateTime.fromMillis(_.key), 'y': _.min}));
        this.chart.update();
    }


    /**
     * Callback function Obsidian invokes to render HTML.
     *
     * This function gets invoked by Obsidian each time a corresponding markdown
     * code block with the correct "language" needs to be rendered. It is
     * responsible for completely rendering the final look of the resulting
     * HTML to show a line chart with historical weight data and an add button.
     **/
    async processMarkdown() {

        // Reload weight data if the log file changes.
        //
        // https://docs.obsidian.md/Reference/TypeScript+API/Vault/on('modify')
        //
        // The "modify" event gets fired when any file in the vault is modified;
        // calling the passed in function. The callback takes a single argument
        // containing a reference to the file that was modified. We releat the
        // data only if it matches the actual weight logfile.
        this.app.vault.on('modify', (file:TAbstractFile) => (file == this.logFile) && this.loadData());

        // Render the HTML contents of the container
        //
        // The HTML must include a <div> containing a <canvas> for the chart
        // to be drawn on; chartjs requires that the <canvas> is the only child
        // of its parent <div>.
        //
        // The HTML must also include a <div> containing the SVG for the add
        // button. We use Eta's "include()" functionality to include the SVG
        // file directly.
        this.container.innerHTML = this.eta.render("@view", {});

        // Register the click callback for the add button.
        //
        // Get a reference to the <div> that we are using as a button via its
        // class; then register the callback frunction for the "click" event.
        // The callback takes a single MouseEvent argument (which we ignore).
        this.container
            .querySelector('.add-button')
            .addEventListener("click", this.handleAddClick.bind(this));
        
        // Define & configure a line chart for weight data
        this.chart = new Chart(this.container.querySelector('canvas'), {
            type: 'line',
            data: {
                datasets: [
                    {label: 'max', radius: 0, fill: '+2'},
                    {label: 'mean'},
                    {label: 'min', radius: 0},
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
                            'rgba(75, 192, 192, 0.10)',  // max
                            'rgb(75, 192, 192)',         // mean
                            'rgba(75, 192, 192, 0.10)',  // min
                        ],
                        backgroundColor: [
                            'rgba(75, 192, 192, 0.10)',  // max
                            'rgba(75, 192, 192, 0.10)',  // mean
                            'rgba(75, 192, 192, 0.10)',  // min
                        ],
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        min: DateTime.now().minus({weeks: 2}).valueOf(),
                        max: DateTime.now().valueOf(),
                        time: {minUnit: 'day'},
                        ticks: {minRotation: 60},
                        display: true,
                    },
                    y: {
                        display: true,
                        ticks: { stepSize: 1 },                                        // only show whole pounds
                        afterDataLimits: scale => { scale.max += 1, scale.min -= 1 },  // add an offset to axis min/max
                    },
                },
                interaction: {mode: 'index'},  // https://www.chartjs.org/docs/latest/configuration/interactions.html#modes
                plugins: {
                    legend: {display: false},  // https://www.chartjs.org/docs/latest/configuration/legend.html
                    zoom: {                    // https://www.chartjs.org/chartjs-plugin-zoom/guide/options.html
                        pan: {
                            enabled: true,
                            mode: 'x',
                            onPanComplete: _ => this.loadData(),
                        },
                        zoom: {
                            wheel: {enabled: true, speed: 0.1, modifierKey: 'shift'},
                            pinch: {enabled: true, speed: 0.1},
                            mode: 'x',
                            onZoomComplete: _ => this.loadData(),
                        },
                    },
                    tooltip: {
                        usePointStyle: true,
                        callbacks: {  // https://www.chartjs.org/docs/latest/configuration/tooltip.html#tooltip-callbacks
                            title: ctx => ctx[0].raw.x.toLocaleString(DateTime.DATE_MED),
                            label: ctx => `${ctx.dataset.label}:\t${Math.round(10 * ctx.raw.y)/10}`,
                            labelPointStyle: ctx => ({pointStyle: false}),
                        },
                    },
                },
            },
        });

        // Load the data for the first time after Markdown rendering
        this.loadData();
    }
}

