import {
    Plugin,
} from 'obsidian';

import {
    WeightView,
} from './views';

export default class FitnessFramework extends Plugin {
    async onload() {
        this.registerMarkdownCodeBlockProcessor("fitness-weight",  (source, container) => new WeightView(this.app, source, container).processMarkdown());
        // this.registerMarkdownCodeBlockProcessor("fitness-workout", (source, container) => new WorkoutView(source, container).processMarkdown());
    }
}

