// import { S3 } from 'aws-sdk';
// import { Component, ComponentID } from '@teambit/component';
// import { StorageResolver } from './storage-resolver';
// import type { ArtifactList } from '../artifact';

// export class S3Resolver implements StorageResolver {
//   name = 's3';
//   // todo artifact map
//   async store(component: Component, artifacts: ArtifactList) {
//     // https://staoge.com/{compId}/aspectId/${path}
//     const artifactsByTaskId = artifacts.groupByTaskId();
//     const files = Object.entries(artifactsByTaskId).map(([taskId, artifact]) => {
//       return artifact.paths.map((path) => this.buildKey(component.id, taskId, path));
//     });
//     // files file to upload
//   }

//   private buildKey(id: ComponentID, taskId: string, path: string) {
//     return id.fullName;
//   }

//   private upload(key: string, body: string) {
//     const s3 = this.getS3Client();
//     s3.upload({
//       Bucket: 'storage',
//       Key: key,
//       Body: body,
//     });
//   }

//   private getS3Client() {
//     //TODO: need to pass bithub token
//     const s3 = new S3({
//       accessKeyId: 'bit',
//       secretAccessKey: process.env.BIT_DEV_TOKEN,
//       endpoint: 'http://bit.test:5003',
//     });
//     return s3;
//   }
// }
