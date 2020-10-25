import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { PkgMain } from './pkg.main.runtime';

export function pkgSchema(pkg: PkgMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        packageManifest: PackageManifest
      }

      extend type Component {
        packageManifest: PackageManifest
      }

      type TarDist {
        tarball: String
        shasum: String
      }

      type VersionsPackageManifest {
        name: String
        version: String
        main: String
        dependencies: JSONObject
        devDependencies: JSONObject
        peerDependencies: JSONObject
        scripts: JSONObject
        dist: TarDist
      }

      type PackageManifest {
        name: String
        distTags: JSONObject
        versions: [VersionsPackageManifest]
      }
    `,
    resolvers: {
      Component: {
        packageManifest: (component: Component) => {
          return pkg.getManifest(component);
        },
      },
    },
  };
}
