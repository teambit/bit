import execa from 'execa';
import fs from 'fs-extra';
import { Graph } from 'graphlib';
import graphviz, { Digraph } from 'graphviz';
import * as path from 'path';

import BitId from '../../bit-id/bit-id';
import BitIds from '../../bit-id/bit-ids';
import logger from '../../logger/logger';
import { getLatestVersionNumber } from '../../utils';

// const Graph = GraphLib.Graph;
// const Digraph = graphviz.digraph;

type ConfigProps = {
  layout?: string; // dot Layout to use in the graph
  fontName?: string; // Arial font name to use in the graph
  fontSize?: string; // 14px Font size to use in the graph
  backgroundColor?: string; // #000000 Background color for the graph
  nodeColor?: string; // #c6c5fe Default node color to use in the graph
  noDependencyColor?: string; // #cfffac Color to use for nodes with no dependencies
  edgeColor?: string; // #757575 Edge color to use in the graph
  graphVizOptions?: Record<string, any>; // null Custom GraphViz options
  graphVizPath?: string; // null Custom GraphViz path
  highlightColor?: string;
};

const defaultConfig: ConfigProps = {
  layout: 'dot',
  fontName: 'Arial',
  fontSize: '14px',
  backgroundColor: '#000000',
  nodeColor: '#c6c5fe',
  noDependencyColor: '#cfffac',
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  devDependencyColor: '#ff0000',
  edgeColor: '#757575',
  highlightColor: 'green',
};

export default class VisualDependencyGraph {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  graphlib: Graph;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  graph: Digraph;
  config: ConfigProps;

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  constructor(graphlib: Graph, graph: Digraph, config: ConfigProps) {
    this.graph = graph;
    this.graphlib = graphlib;
    this.config = config;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static async loadFromGraphlib(graphlib: Graph, config: ConfigProps = {}): Promise<VisualDependencyGraph> {
    const mergedConfig = Object.assign({}, defaultConfig, config);
    await checkGraphvizInstalled(config.graphVizPath);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const graph: Digraph = VisualDependencyGraph.buildDependenciesGraph(graphlib, mergedConfig);
    return new VisualDependencyGraph(graphlib, graph, mergedConfig);
  }

  /**
   * Creates the graphviz graph
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static buildDependenciesGraph(graphlib: Graph, config: ConfigProps): Digraph {
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
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        setEdgeColor(vizEdge, config.devDependencyColor);
      }
    });

    return graph;
  }

  getNode(id: BitId) {
    if (id.hasVersion()) {
      return this.graph.getNode(id.toString());
    }
    // if there is no version, search for the component with the latest version
    const allIds = this.graphlib.nodes().map((n) => this.graphlib.node(n));
    const bitIds = BitIds.fromArray(allIds);
    const latestId = getLatestVersionNumber(bitIds, id);
    return this.graph.getNode(latestId.toString());
  }

  highlightId(id: BitId) {
    const node = this.getNode(id);
    setNodeColor(node, this.config.highlightColor);
  }

  /**
   * Creates an image from the module dependency graph.
   * @param  {String} imagePath
   * @return {Promise}
   */
  async image(imagePath: string): Promise<string> {
    const options: Record<string, any> = createGraphvizOptions(this.config);
    const type: string = path.extname(imagePath).replace('.', '') || 'png';
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
 * Set color on a node.
 * @param  {Object} node
 * @param  {String} color
 */
function setNodeColor(node, color) {
  node.set('color', color);
  node.set('fontcolor', color);
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
function createGraphvizOptions(config) {
  const graphVizOptions = config.graphVizOptions || {};

  return {
    G: Object.assign(
      {
        overlap: false,
        pad: 0.111,
        layout: config.layout,
        bgcolor: config.backgroundColor,
      },
      graphVizOptions.G
    ),
    E: Object.assign(
      {
        color: config.edgeColor,
      },
      graphVizOptions.E
    ),
    N: Object.assign(
      {
        fontname: config.fontName,
        fontsize: config.fontSize,
        color: config.nodeColor,
        fontcolor: config.nodeColor,
      },
      graphVizOptions.N
    ),
  };
}
