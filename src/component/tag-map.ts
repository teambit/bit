import { SemVer } from 'semver';
import { Snap } from '../snap';

export default class TagMap extends Map<SemVer, Snap> {}
