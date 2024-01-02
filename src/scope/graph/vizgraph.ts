import execa from 'execa';
import os from 'os';
import fs from 'fs-extra';
import { Graph } from 'graphlib';
import graphviz, { Digraph } from 'graphviz';
import { Graph as ClearGraph } from '@teambit/graph.cleargraph';
import * as path from 'path';
import logger from '../../logger/logger';
import { generateRandomStr } from '../../utils';

export type GraphConfig = {
  layout?: string; // dot Layout to use in the graph
  graphVizPath?: string; // null Custom GraphViz path
  colorPerEdgeType?: { [edgeType: string]: string };
};

const defaultConfig: GraphConfig = {
  layout: 'dot',
};

export default class VisualDependencyGraph {
  graphlib: Graph;
  graph: Digraph;
  config: GraphConfig;
  constructor(graphlib: Graph, graph: Digraph, config: GraphConfig) {
    this.graph = graph;
    this.graphlib = graphlib;
    this.config = config;
  }

  static async loadFromGraphlib(graphlib: Graph, config: GraphConfig = {}): Promise<VisualDependencyGraph> {
    const mergedConfig = Object.assign({}, defaultConfig, config);
    await checkGraphvizInstalled(config.graphVizPath);
    const graph: Digraph = VisualDependencyGraph.buildDependenciesGraph(graphlib, mergedConfig);
    return new VisualDependencyGraph(graphlib, graph, mergedConfig);
  }

  static async loadFromClearGraph(
    clearGraph: ClearGraph<any, any>,
    config: GraphConfig = {},
    markIds?: string[]
  ): Promise<VisualDependencyGraph> {
    const mergedConfig = { ...defaultConfig, ...config };
    await checkGraphvizInstalled(config.graphVizPath);
    const graph: Digraph = VisualDependencyGraph.buildDependenciesGraphFromClearGraph(
      clearGraph,
      mergedConfig,
      markIds
    );
    // @ts-ignore
    return new VisualDependencyGraph(clearGraph, graph, mergedConfig);
  }

  /**
   * Creates the graphviz graph
   */
  static buildDependenciesGraph(graphlib: Graph, config: GraphConfig): Digraph {
    const graph = graphviz.digraph('G');

    if (config.graphVizPath) {
      graph.setGraphVizPath(config.graphVizPath);
    }

    const nodes = graphlib.nodes();
    const edges = graphlib.edges();

    nodes.forEach((node) => {
      graph.addNode(node);
    });
    edges.forEach((edge) => {
      const edgeType = graphlib.edge(edge);
      const vizEdge = graph.addEdge(edge.v, edge.w);
      if (edgeType !== 'dependencies') {
        setEdgeColor(vizEdge, 'red');
      }
    });

    return graph;
  }

  static buildDependenciesGraphFromClearGraph(
    clearGraph: ClearGraph<any, any>,
    config: GraphConfig,
    markIds?: string[]
  ): Digraph {
    const graph = graphviz.digraph('G');

    if (config.graphVizPath) {
      graph.setGraphVizPath(config.graphVizPath);
    }

    const nodes = clearGraph.nodes;
    const edges = clearGraph.edges;

    nodes.forEach((node) => {
      const attr = node.attr;

      const props: any = {
        label: node.id,
      };
      if (markIds?.includes(node.id)) {
        props.color = 'red';
        props.style = 'filled';
      }
      if (typeof attr === 'object' && (attr.tag || attr.pointers)) {
        const tag = attr.tag ? ` (${attr.tag})` : '';
        const pointers = attr.pointers ? `<BR/><B>${attr.pointers.join(', ')}</B>` : '';
        // the "!" prefix enables the "html-like" syntax
        props.label = `!${node.id}${tag}${pointers}`;
      }

      graph.addNode(node.id, props);
    });
    edges.forEach((edge) => {
      const edgeType = edge.attr;
      const getLabel = () => {
        if (!config.colorPerEdgeType) return undefined; // it's not version-history graph
        if (edgeType === 'parent') return undefined;
        return edgeType;
      };
      const vizEdge = graph.addEdge(edge.sourceId, edge.targetId, { label: getLabel() });
      const color = config.colorPerEdgeType?.[edgeType];
      setEdgeColor(vizEdge, color);
    });

    return graph;
  }

  private getTmpFilename() {
    return path.join(os.tmpdir(), `${generateRandomStr()}.png`);
  }

  /**
   * Creates an image from the module dependency graph.
   * @param  {String} imagePath
   * @return {Promise}
   */
  async image(imagePath: string = this.getTmpFilename()): Promise<string> {
    const options: Record<string, any> = createGraphvizOptions(this.config);
    const type: string = path.extname(imagePath).replace('.', '') || 'png';
    options.type = type;

    const outputP: Promise<Buffer> = new Promise((resolve, reject) => {
      this.graph.output(options, resolve, (code, out, err) => {
        logger.debug('Error during viz graph output function');
        logger.debug(code, out, err);
        reject(new Error(err));
      });
    });

    const image = await outputP;
    await fs.writeFile(imagePath, image);
    return path.resolve(imagePath);
  }

  /**
   * Return the module dependency graph as DOT output.
   * @return {dot}
   */
  dot() {
    return this.graph.to_dot();
  }
}

/**
 * Set color on an edge.
 * @param  {Object} edge
 * @param  {String} color
 */
function setEdgeColor(edge, color) {
  edge.set('color', color);
}

/**
 * Check if Graphviz is installed on the system.
 * @param  {Object} config
 * @return {Promise}
 */
function checkGraphvizInstalled(graphVizPath?: string) {
  const options: Record<string, any> = {
    shell: true,
  };
  if (graphVizPath) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    options.cwd = graphVizPath;
  }

  const childProcess = execa('gvpr', ['-V'], options);
  return childProcess.catch((e) => {
    logger.debug(`Graphviz could not be found in path: ${graphVizPath || 'default path'}`);
    throw new Error(`Graphviz could not be found. Ensure that "gvpr" is in your $PATH.\n${e}`);
  });
}

/**
 * Return options to use with graphviz digraph.
 * @param  {Object} config
 * @return {Object}
 */
function createGraphvizOptions(config: GraphConfig) {
  return {
    G: Object.assign({
      layout: config.layout,
      bgcolor: 'black',
    }),
    E: Object.assign({
      color: 'green',
      fontcolor: 'white',
      labelfontcolor: 'white',
    }),
    N: Object.assign({
      fontname: 'Arial',
      color: '#c6c5fe',
      fontcolor: '#c6c5fe',
      fontsize: '14px',
    }),
  };
}
