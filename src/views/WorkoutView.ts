
import { Eta } from 'eta';
import  Toml  from 'toml';
import { DateTime } from 'luxon';

import * as templates from './templates';


/**
 **/
class WorkoutView {

    // The HTML element (div) this
    // view will be rendered into
    container: HTMLElement;

    // ???
    eta: Eta;

    /**
     * DASHBOARD
     * WORKOUT
     * REST
     * RUNNING
     * PAUSED
     * 
     */
    state: string;
    workoutTitle: string;
    workoutNext: string;


    
    isStarted;
    index;
    steps;


    startTime;
    
    /**
     *
     **/
    constructor(source: string, container: HTMLElement) {
        this.container = container;

        this.eta = new Eta();
        this.eta.loadTemplate("@view", templates.WorkoutView);
        this.eta.loadTemplate("@next", templates.WorkoutNext);
        this.eta.loadTemplate("@play", templates.WorkoutPlay);
        this.eta.loadTemplate("@prev", templates.WorkoutPrev);
        this.eta.loadTemplate("@stop", templates.WorkoutStop);
        this.eta.loadTemplate("@close", templates.WorkoutClose);
        
        const data = Toml.parse(source);
        
        this.steps = [];

        // 


        for (let i = 0; i < data.actions.length; i++) {
            let step = {}
            const actionCurrent = data.actions[i];
            const actionNext = data.actions[i+1];

            const nameCurrent = actionCurrent.name;
            const nameNext = actionNext?.name;
            const timeTotal = actionCurrent.time;
            const setsTotal = actionCurrent.sets || 1;
            const repsTotal = actionCurrent.reps;

            for (let set = 1; set <= setsTotal; set++) {
                // Rest before
                if (actionCurrent.rest?.before) {
                    this.steps.push({
                        nameCurrent: nameCurrent,
                        nameNext: nameNext,
                        timeTotal: timeTotal,
                        setsTotal: setsTotal,
                        repsTotal: repsTotal,
                        restTime: actionCurrent.rest.before,
                        setsCurrent: set,
                    });
                }

                // The actual thing
                this.steps.push({
                    nameCurrent: nameCurrent,
                    nameNext: nameNext,
                    timeTotal: timeTotal,
                    setsTotal: setsTotal,
                    repsTotal: repsTotal,
                    setsCurrent: set,
                });
                
                if (actionCurrent.rest?.after) {
                    this.steps.push({
                        nameCurrent: nameCurrent,
                        nameNext: nameNext,
                        timeTotal: timeTotal,
                        setsTotal: setsTotal,
                        repsTotal: repsTotal,
                        restTime: actionCurrent.rest.before,
                        setsCurrent: set,
                    });
                }
            }
        }

        console.log(this.steps);
        
        // Initialize state
        this.index = 0;
        this.isStarted = false;
        this.progress = 0;

    }


    /**
     * Callback function Obsidian invokes to render HTML.
     *
     * This function is responsible to registering event listeners
     * and using the Eta template to render the top level HTML.
     **/
    async processMarkdown() {

        // Need fullscreenchange listener in case we exit full screen via Esc or such
        this.container.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) this.onStop() });
        this.container.addEventListener("click", this.onClick.bind(this));

        // ???
        this.container.innerHTML = this.eta.render("@view", {});

        // Save element containers for future use
        this.containerDashboard = this.container.querySelector('div#dashboard')
        this.containerWorkout   = this.container.querySelector('div#workout')
        this.headerWorkoutTitle = this.container.querySelector('div#workout h1');
        this.headerWorkoutNext  = this.container.querySelector('div#workout h3');
        this.circleProgressFg   = this.container.querySelector('div#workout circle.fg')
        this.infoCurrentSet     = this.container.querySelector('div#workout span#currentSet')
        this.infoCurrentTime    = this.container.querySelector('div#workout span#currentTime')
        this.infoCurrentReps    = this.container.querySelector('div#workout span#currentReps')

        // Set initial state and render
        this.state = 'DASHBOARD';
        this.render();

    }


    /**
     *
        // State:
        //    - current action name
        //    - next action name
        //    - current set
        //    - total sets
        //
        //    - current progress percent
        //    - current time
        //    - number of reps
        //    - is resting boolean
        //    - 
     *
     */
    async render() {




        
        // Show/hide the appropriate containers
        switch (this.state) {
            case 'DASHBOARD':
                this.containerWorkout.style.display = 'none';
                this.containerDashboard.style.display = 'block';
                break;
            case 'WORKOUT':
                this.containerWorkout.style.display = 'block';
                this.containerDashboard.style.display = 'none';
                break;
        }

        // Set title and such
        this.headerWorkoutTitle.innerHTML = this.workoutTitle;
        this.headerWorkoutNext.innerHTML = this.workoutNext;

        // TODO: set workout info

        // Set progress bar
        const radius = this.circleProgressFg.getAttribute('r');
        const circum = 2*3.14159265359*radius;
        const on = circum*this.progress/100;
        const off = circum*(1-this.progress/100);

        this.circleProgressFg.style.display = this.progress ? "block" : "none";
        this.circleProgressFg.setAttribute('stroke-dasharray', `${on} ${off}`)

        // Set progress bar content




        // TODO: Enable/disable control buttons

        // window.clearInterval(this.timer);
        
    }


    /**
     *
     **/
    async onClick(event: MouseEvent) {
        const button = (event.target as HTMLElement)?.closest(".button");
        switch (button?.id) {
            case "start": this.onStart(); break;
            case "close": this.onStop();  break;
            case "next": this.onNext(event); break;
            case "prev": this.onPrev(event); break;
            case "play-pause": this.onPlayPause(event); break;
        }
    }

    
    /**
     *
     */
    async onStart() {
        this.container.requestFullscreen();

        // ???
        this.state = 'WORKOUT';
        this.workoutTitle = "Forearm Plank"
        this.workoutNext = "Dead Bug"
        this.progress = 0;
        this.render();

    }

    async onStop() {
        if (document.fullscreenElement) document.exitFullscreen();

        // ???
        this.state = 'DASHBOARD';
        this.render();
    }
    
    


    /**
     *
     */
    async startTimer() {

        this.startTime = DateTime.now();
        this.endTime   = this.startTime.plus({'seconds': this.steps[this.index].timeTotal});
        const total = this.endTime - this.startTime;
        console.log(total)
        
        this.timer = window.setInterval(_ => {
            const now = DateTime.now() - this.startTime;
            const percent = 100 * now / total
            
            this.setProgress(percent);

            if (percent > 100) {
                window.clearInterval(this.timer);
            } 
        }, 50);

    }


    /**
     * 
     */
    async stopTimer() {

    }



    

    async onNext(event: MouseEvent) {
        this.index++;
        if (this.index >= this.steps.length) this.index--;
        await this.render();
    }

    async onPrev(event: MouseEvent) {
        this.index--;
        if (this.index < 0) this.index++;
        this.render();
    }

    async onPlayPause(event: MouseEvent) {
        console.log("PP"); 
    }

};





