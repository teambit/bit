export interface DependencyDetector {
  type: string;

  detect(): boolean;
}
