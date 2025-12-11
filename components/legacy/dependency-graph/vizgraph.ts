import execa from 'execa';
import tempy from 'tempy';
import os from 'os';
import fs from 'fs-extra';
import type { Graph } from 'graphlib';
import { Digraph, Subgraph, Node, Edge, toDot } from 'ts-graphviz';
// @ts-ignore
// eslint-disable-next-line import/no-unresolved
import { toFile } from 'ts-graphviz/adapter';
import { instance } from '@viz-js/viz';
import type { Graph as ClearGraph } from '@teambit/graph.cleargraph';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import * as path from 'path';
import { logger } from '@teambit/legacy.logger';

export type GraphConfig = {
  layout?: string; // dot Layout to use in the graph
  graphVizPath?: string; // null Custom GraphViz path
  colorPerEdgeType?: { [edgeType: string]: string };
};

const defaultConfig: GraphConfig = {
  layout: 'dot',
};

export class VisualDependencyGraph {
  constructor(
    public graph: Digraph,
    public config: GraphConfig
  ) {}

  static async loadFromGraphlib(graphlib: Graph, config: GraphConfig = {}): Promise<VisualDependencyGraph> {
    const mergedConfig = Object.assign({}, defaultConfig, config);
    const graph: Digraph = VisualDependencyGraph.buildDependenciesGraph(graphlib);
    return new VisualDependencyGraph(graph, mergedConfig);
  }

  static async loadFromClearGraph(
    clearGraph: ClearGraph<any, any>,
    config: GraphConfig = {},
    markIds?: string[]
  ): Promise<VisualDependencyGraph> {
    const mergedConfig = { ...defaultConfig, ...config };
    const graph: Digraph = VisualDependencyGraph.buildDependenciesGraphFromClearGraph(
      clearGraph,
      mergedConfig,
      markIds
    );
    return new VisualDependencyGraph(graph, mergedConfig);
  }

  static async loadFromMultipleClearGraphs(
    clearGraphs: ClearGraph<any, any>[],
    config: GraphConfig = {},
    markIds?: string[]
  ): Promise<VisualDependencyGraph> {
    const mergedConfig = { ...defaultConfig, ...config };
    const mainGraph = new Digraph('G');

    clearGraphs.forEach((clearGraph, idx) => {
      const subGraph = new Subgraph(`cluster_cycle_${idx}`);
      mainGraph.addSubgraph(subGraph);
      subGraph.set('label', `Cycle #${idx + 1}`);

      VisualDependencyGraph.loadFromClearGraphIntoGraphViz(clearGraph, subGraph as any as Digraph, config, markIds);
    });

    return new VisualDependencyGraph(mainGraph, mergedConfig);
  }

  /**
   * Creates the graphviz graph
   */
  static buildDependenciesGraph(graphlib: Graph): Digraph {
    const graph = new Digraph('G');
    const nodes = graphlib.nodes();
    const edges = graphlib.edges();

    const digraphNodes = nodes.map((node) => new Node(node));
    digraphNodes.forEach((node) => graph.addNode(node));
    const digraphNodesObj = digraphNodes.reduce((acc, node) => {
      acc[node.id] = node;
      return acc;
    }, {});

    nodes.forEach((node) => {
      graph.addNode(new Node(node));
    });
    edges.forEach((edge) => {
      const edgeType = graphlib.edge(edge);
      const digraphEdge = new Edge([digraphNodesObj[edge.v], digraphNodesObj[edge.w]]);
      if (edgeType !== 'dependencies') {
        digraphEdge.attributes.set('color', 'red');
      }
      graph.addEdge(digraphEdge);
    });

    return graph;
  }

  static buildDependenciesGraphFromClearGraph(
    clearGraph: ClearGraph<any, any>,
    config: GraphConfig,
    markIds?: string[]
  ): Digraph {
    const graph = new Digraph('G');
    return VisualDependencyGraph.loadFromClearGraphIntoGraphViz(clearGraph, graph, config, markIds);
  }

  static loadFromClearGraphIntoGraphViz(
    clearGraph: ClearGraph<any, any>,
    graph: Digraph,
    config: GraphConfig = {},
    markIds?: string[]
  ): Digraph {
    const nodes = clearGraph.nodes;
    const edges = clearGraph.edges;

    const digraphNodes = nodes.map((node) => {
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
        // the "<>" wrap enables the "html-like" syntax
        props.label = `<${node.id}${tag}${pointers}>`;
      }

      return new Node(node.id, props);
    });
    digraphNodes.forEach((node) => graph.addNode(node));
    const digraphNodesObj = digraphNodes.reduce((acc, node) => {
      acc[node.id] = node;
      return acc;
    }, {});
    edges.forEach((edge) => {
      const edgeType = edge.attr;
      const getLabel = () => {
        if (!config.colorPerEdgeType) return undefined; // it's not version-history graph
        if (edgeType === 'parent') return undefined;
        return edgeType;
      };
      const vizEdge = new Edge([digraphNodesObj[edge.sourceId], digraphNodesObj[edge.targetId]], { label: getLabel() });
      const color = config.colorPerEdgeType?.[edgeType];
      if (color) setEdgeColor(vizEdge, color);
      graph.addEdge(vizEdge);
    });

    return graph;
  }

  private getTmpFilename() {
    return path.join(os.tmpdir(), `${generateRandomStr()}.png`);
  }

  /**
   * with this library no need to install Graphviz in the OS.
   * it supports SVG and other formats (run vs.format to see all formats), but not "png" nor "gif".
   *
   * returns the path to the rendered file.
   */
  async renderUsingViz(format: string = 'svg'): Promise<string> {
    const dot = this.dot();
    const viz = await instance();
    const result = viz.render(dot, { format });
    if (result.errors.length) {
      throw new Error(
        `failed to render the graph, errors:\n${result.errors.map((e) => `${e.level}: ${e.message}`).join('\n')}`
      );
    }
    const file = tempy.file({ extension: 'svg' });
    await fs.writeFile(file, result.output);
    return file;
  }

  async getAsSVGString(): Promise<string | undefined> {
    const dot = this.dot();
    const viz = await instance();
    const result = viz.render(dot, { format: 'svg' });
    if (result.errors.length) {
      throw new Error(
        `failed to render the graph, errors:\n${result.errors.map((e) => `${e.level}: ${e.message}`).join('\n')}`
      );
    }
    return result.output;
  }

  /**
   * @returns the file path of the rendered image.
   */
  async render(format: string = 'svg'): Promise<string> {
    return format === 'png' || format === 'gif' ? this.image() : this.renderUsingViz(format);
  }

  /**
   * Creates an image from the module dependency graph.
   * @param  {String} imagePath
   * @return {Promise}
   */
  async image(imagePath: string = this.getTmpFilename()): Promise<string> {
    await checkGraphvizInstalled();
    const type: string = path.extname(imagePath).replace('.', '') || 'png';

    const dot = this.dot();
    await toFile(dot, imagePath, { format: type });

    return imagePath;
  }

  /**
   * Return the module dependency graph as DOT output.
   */
  dot(): string {
    const { G, E, N } = createGraphvizOptions(this.config);
    this.graph.graph(G);
    this.graph.edge(E);
    this.graph.node(N);

    return toDot(this.graph);
  }
}

/**
 * Set color on an edge.
 * @param  {Object} edge
 * @param  {String} color
 */
function setEdgeColor(edge: Edge, color: string) {
  edge.attributes.set('color', color);
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
      fontsize: '14',
    }),
  };
}
