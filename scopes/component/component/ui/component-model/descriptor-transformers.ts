import { ComponentDescriptor } from '@teambit/component-descriptor';
import { capitalize } from '@teambit/toolbox.string.capitalize';
import { DeprecationAspect } from '@teambit/deprecation';
import DocsAspect from '@teambit/docs';

export function getPackageName(component: ComponentDescriptor) {
  const builderData = component.get<any>('teambit.pipelines/builder');
  if (!builderData || !builderData.data) return '';
  const aspectData = builderData?.data?.aspectsData || [];
  const pkgData = aspectData.find((entry) => entry.aspectId === 'teambit.pkg/pkg');
  return pkgData?.data?.pkgJson?.name;
}
  
export function getDisplayName(component: ComponentDescriptor) {
  const tokens = component.id.name.split('-').map((token) => capitalize(token));
  return tokens.join(' ');
}

export function getEnv(component: ComponentDescriptor) {
  const defaultEnv = {
    id: 'teambit.harmony/node',
    // icon: ''
  };

  // TODO: fix this to Aspect ID.
  const envsData = component.get<any>('teambit.envs/envs');
  return envsData?.data || defaultEnv;
}

function getDocsProperty(component: ComponentDescriptor, name: string) {
  const docs = component.get<any>(DocsAspect.id)?.data || {};
  if (!docs || !docs?.doc?.props) return undefined;
  const docProps = docs.doc.props;
  return docProps.find(prop => prop.name === name);
}

export function getDescription(component: ComponentDescriptor) {
  const descriptionItem = getDocsProperty(component, 'description');
  if (!descriptionItem) return '';
  return descriptionItem.value || '';
}

export function getLabels(component: ComponentDescriptor): string[] {
  const labelsItem = getDocsProperty(component, 'labels');
  if (!labelsItem) return [];
  return labelsItem.value || [];
} 

export function getDeprecation(component: ComponentDescriptor) {
  const deprecationData = component.get<any>(DeprecationAspect.id);
  if (!deprecationData) return { isDeprecate: false };
  return deprecationData;
}
