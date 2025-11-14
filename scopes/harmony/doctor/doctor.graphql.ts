import type { Schema } from '@teambit/graphql';
import { gql } from 'graphql-tag';
import type { ScopeMain } from '@teambit/scope';
import { runDoctorOnScope } from './run-doctor-on-scope';

export function doctorSchema(scopeMain: ScopeMain): Schema {
  return {
    typeDefs: gql`
      type DiagnosisMetaData {
        name: String!
        description: String!
        category: String!
      }

      type ExamineBareResult {
        valid: Boolean!
        data: JSONObject
      }

      type ExamineResult {
        diagnosisMetaData: DiagnosisMetaData!
        bareResult: ExamineBareResult!
        formattedSymptoms: String!
        formattedManualTreat: String!
      }

      type DoctorMetaData {
        nodeVersion: String!
        runningTimestamp: Float!
        platform: String!
        bitVersion: String!
        npmVersion: String
        yarnVersion: String
        userDetails: String!
      }

      type DoctorResponse {
        examineResults: [ExamineResult]!
        metaData: DoctorMetaData!
      }

      extend type Scope {
        # run doctor diagnostics on the scope
        doctor(diagnosisName: String): DoctorResponse!
      }
    `,
    resolvers: {
      Scope: {
        doctor: async (_: ScopeMain, { diagnosisName }: { diagnosisName?: string }) => {
          return runDoctorOnScope(scopeMain.legacyScope, diagnosisName);
        },
      },
    },
  };
}
