// @flow
import * as packageJson from '../component/package-json';
export type DependencyStatusResult = { missing_files: string[] };
//import { DEFAULT_BINDINGS_PREFIX } from '../../../src/constants';
export type DependencyStatusProps = { main_file: string };

async function getTopLevelDependencies(consumer: Consumer, dependencyStatusProps:DependencyStatusProps) {
    const driver = await consumer.driver.getDriver(false);
    let files = [];
    files.push(dependencyStatusProps.main_file);
    const consumerPath = consumer.getPath();
    const tree = await driver.getDependencyTree(consumerPath, consumerPath, files, '@bit');
    const top_level_dependencies = Object.keys(tree.tree).map(top_level_file=>top_level_file);    
    return top_level_dependencies;

}

function getComponentFiles(consumer: Consumer) {
    let bitmap = consumer.bitMap;
    const componentsMaps = bitmap.getAllComponents();
    let component_files = [];
    Object.keys(componentsMaps).forEach(function(key) {
            let current_files = componentsMaps[key].files.map(file=>file.relativePath);
            component_files = component_files.concat(current_files);
        });
    return component_files;
}

export async function getDependencyStatus( consumer: Consumer, dependencyStatusProps:DependencyStatusProps): 
    Promise<DependencyStatusResult[]> {
    const top_level_dependencies = await getTopLevelDependencies(consumer, dependencyStatusProps);    
    let component_files = getComponentFiles(consumer);   

    let missing_dependency_files = [];
    top_level_dependencies.forEach(function(dependency) {
        if(!component_files.includes(dependency)){
            missing_dependency_files.push(dependency);
        }
    });

    const results: DependencyStatusResult = { missing_files: missing_dependency_files };    
    return results;
}

