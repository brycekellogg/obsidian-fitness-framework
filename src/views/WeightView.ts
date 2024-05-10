import {
    App,
    TFile,
    Modal,
} from 'obsidian';


import { DateTime } from 'luxon';
import { Eta }      from 'eta';
import { Chart }    from 'chart.js/auto';
import zoomPlugin   from 'chartjs-plugin-zoom';
import 'chartjs-adapter-luxon';

// ???
import * as templates from '../templates';




//
//
//
//
export default class WeightView {

	// For example, with a factor of 100:
	//       0 < xRange < 100 => groupBy = 1
	//     100 < xRange < 200 => groupBy = 2
	//     200 < xRange < 300 => groupBy = 3
	//
	GROUP_BY_FACTOR = 100;

	// ????
	LOG_PATH = 'Health & Fitness/Logs/Weight.csv';

	
	// ???
	//
	//
	//
    constructor(app, source: string, container: HTMLElement) {

		// ???
		Chart.register(zoomPlugin);
		
        this.container = container;
        this.app = app;
        this.logFile = this.app.vault.getAbstractFileByPath(this.LOG_PATH) as TFile;

		// ???
        this.eta = new Eta();
        this.eta.loadTemplate("@view", templates.WeightView);
        this.eta.loadTemplate("@add", templates.Add);
    }


    //
    //
    //
    //
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


    //
    // TODO: we should cache somehow; only read in new data
    //
    //
    //
    async loadData() {

        // ???
        const xMin = DateTime.fromMillis(this.chart.options.scales.x.min)
        const xMax = DateTime.fromMillis(this.chart.options.scales.x.max)
        const xRange = Math.round(xMax.diff(xMin).as('days'));
		
		// ???
        const groupBy = 1 + Math.floor(xRange / this.GROUP_BY_FACTOR);

		// ???
        const start = xMin.minus({days: xRange});

        // Read in log files into strings
        // & split into a list of records
        const dataString = (await this.app.vault.cachedRead(this.logFile));
        let rows = dataString.trim().split('\n');

        // Find the starting record using binary search. Because
        // the timestamp is stored using ISO-8601, lexicographical
        // order equals chronological order, so we can compare
        // strings directly. Once we find the start, slice the
        // array to ignore the unneeded earlier records.
        const needle = start.toISO();
        var index;
        let upper = rows.length-1;
        let lower = 0;
        while (lower <= upper) {
            index = Math.floor((upper+lower)/2);
            upper = needle < rows[index] ? index-1 : upper;
            lower = needle > rows[index] ? index+1 : lower;
        }
        rows = rows.slice(index);

        // Process data from a list of strings into an object of the form:
		// {
		//     ['key']: {min: <float>, max: <float>, mean: <float>},
		// }
        // ?????
        let data = {}
        for (const row of rows) {

            // Extract timestamp & value from "timestamp,value".
            // We can use split because we always know that
            // timestamp will be the first column & value will
            // be the second column; always delimited by a comma.
            // Also there will never be a header to skip.
            let [timestamp, value] = row.trim().split(',');

            // Convert data types
            timestamp = DateTime.fromISO(timestamp);
            value = Number(value);

            // Calculate "groupBy" key by using the "ordinal" (day of year)
			// such that all days in a "group" result in a key equal to the
			// first date in that group. For example: 
			// 
			//     |  Date   | Ordinal | key (groupBy=2) | key (groupBy=3) |
			//     | Jan 1st |    1    |        1        |        1        |
			// 	   | Jan 2nd |    2    |        1        |        1        |
			// 	   | Jan 3rd |    3    |        3        |        1        |
			// 	   | Jan 4th |    4    |        3        |        4        |
			// 
            // Note: timestamp.ordinal is 1-indexed, so we need to subtract by
			//       one or else dates show up one day later than expected.
            const days = Math.floor(timestamp.ordinal / groupBy)*groupBy - 1;
            const key  = timestamp.startOf('year').plus({days: days}).valueOf();

            if (data[key] == undefined) {

				// If this is the first time seeing this particular
				// key, create a default record that we can update.
                data[key] = {
                    key: key,
                    min: value,
                    max: value,
                    mean: value,           // weighted
                    value: value,          // prev
                    timestamp: timestamp,  // prev
                    duration: 0,
                }
            } else {

                // Update calculation of min, max, & time weighted mean
                const dt = timestamp.diff(data[key].timestamp).as('seconds');
                data[key].mean *= data[key].duration;
                data[key].mean += 0.5 * (data[key].value + value) * dt;
                data[key].mean /= data[key].duration + dt;
                data[key].duration += dt;
                data[key].value = value;
                data[key].timestamp = timestamp;
                data[key].min = Math.min(data[key].min, value);
                data[key].max = Math.max(data[key].max, value);
            }
        }

		// ???
        this.chart.data.datasets[0].data = Object.values(data).map(_ => ({'x': _.key, 'y': _.max}));
        this.chart.data.datasets[1].data = Object.values(data).map(_ => ({'x': _.key, 'y': _.mean}));
        this.chart.data.datasets[2].data = Object.values(data).map(_ => ({'x': _.key, 'y': _.min}));
        this.chart.update();
    }


    //
    // Callback function Obsidian invokes to render HTML.
    //
    // This function gets invoked by Obsidian each time a corresponding markdown
    // code block with the correct "language" needs to be rendered. It is
    // responsible for completely rendering the final look of the resulting
    // HTML to show a line chart with historical weight data and an add button.
    //
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

