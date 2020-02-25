import React from 'react';
import { Color } from 'ink';
import { Command } from '../paper';
import { Graph } from './graph';

export class InsightsCmd implements Command {
  name = 'graph';
  description = 'get your component graph'
  alias = 'g';
  group = 'development'
  shortDescription = ''
  options = []

  constructor(
    private graph: Graph
  ) {}

  async render() {
    const graph = await this.graph.build();
    return <Color green>{graph.stringify()}</Color>;
  }
}
