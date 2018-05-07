// @flow
import * as packageJson from '../component/package-json';
import { Consumer } from '..';
import { 
    DEFAULT_BINDINGS_PREFIX 
} from '../../constants';

export type DependencyStatusResult = { missingFiles: string[] };
export type DependencyStatusProps = { mainFile: string[] };

async function getTopLevelDependencies(consumer: Consumer, dependencyStatusProps:DependencyStatusProps) {
    const driver = await consumer.driver.getDriver(false);
    const paths = dependencyStatusProps.mainFile;
    const consumerPath = consumer.getPath();
    const tree = await driver.getDependencyTree(consumerPath, consumerPath, paths, DEFAULT_BINDINGS_PREFIX);
    const topLevelDependencies = Object.keys(tree.tree).map(topLevelFile => topLevelFile);    
    return topLevelDependencies;
}

function getComponentFiles(consumer: Consumer) {
    const bitmap = consumer.bitMap;
    const componentsMaps = bitmap.getAllComponents();
    const componentFile = [];
    Object.values(componentsMaps).forEach( function(value) {
            const currentFiles = value.files.map(file => file.relativePath);
            componentFile = componentFile.concat(currentFiles);
        });
    return componentFile;
}

export default async function getDependencyStatus(consumer: Consumer, dependencyStatusProps: DependencyStatusProps): 
    Promise<DependencyStatusResult[]>  {
    const topLevelDependencies = await getTopLevelDependencies(consumer, dependencyStatusProps);    
    let componentFiles = getComponentFiles(consumer);   
    const missingDependencyFiles = [];
    topLevelDependencies.forEach(function (dependency) {
        if(!componentFiles.includes(dependency)) {
            if(dependency.startsWith(',')) {
                dependency = dependency.substring(1);
            }
            missingDependencyFiles.push(dependency);
        }
    });

    const results: DependencyStatusResult = { missingFiles: missingDependencyFiles };    
    return results;
}
