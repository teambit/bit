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
        versions(version: String): [VersionsPackageManifest]
      }
    `,
    resolvers: {
      Component: {
        packageManifest: (component: Component) => {
          return pkg.getManifest(component);
        },
      },
      PackageManifest: {
        versions: (parent, { version }) => {
          if (version) {
            return parent.versions.filter((v) => v.version === version);
          }
          return parent.versions;
        },
      },
    },
  };
}
