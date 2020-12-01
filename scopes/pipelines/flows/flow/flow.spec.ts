// /* eslint-disable no-plusplus */
// import { expect } from 'chai';
// import { remove } from 'fs-extra';
// import { Subject } from 'rxjs';

// import { getTestCase } from '../task/task.spec';
// import { createFakeCapsule } from '../util/create-capsule';
// import { Flow } from './flow';

// //
// // qballer TODO - refactor these tests to make them shorter,
// //                they violate the dry principle.

// describe.skip('flows', function () {
//   it('should support flow with errors', async function () {
//     const id = '@bit-test2/flow1';
//     const fakeFS = getTestCase(id);
//     const fakeCapsule = await createFakeCapsule(fakeFS, id);
//     const stream = new Flow(['1>&2 echo hello-flow && false', 'echo hello-flow2']).execute(fakeCapsule);
//     let started = false;
//     let taskSubject = 0;
//     return new Promise((resolve) =>
//       stream.subscribe({
//         next(data: any) {
//           if (data.type === 'flow:start') {
//             started = true;
//           }
//           data instanceof Subject && ++taskSubject;
//         },
//         error(err) {
//           expect(started, 'started message sent').to.be.true;
//           expect(err.value.tasks.length, 'got two results').to.equal(2);
//           expect(taskSubject, 'got subject').to.equal(1);
//           resolve();
//         },

//         complete() {
//           expect(false, 'should have error').to.be.true;
//         },
//       })
//     );
//   });

//   it('should support flow with several tasks', async function () {
//     const id = '@bit-test2/flow1';
//     const fakeFS = getTestCase(id);
//     const fakeCapsule = await createFakeCapsule(fakeFS, id);
//     const stream = new Flow(['echo hello-flow', 'echo hello-flow2']).execute(fakeCapsule);
//     let started = false;
//     let taskSubject = 0;
//     let result: any;
//     return new Promise((resolve) =>
//       stream.subscribe({
//         next(data: any) {
//           if (data.type === 'flow:start') {
//             started = true;
//           } else if (data.type === 'flow:result') {
//             result = data.value;
//           } else {
//             data instanceof Subject && ++taskSubject;
//           }
//         },
//         complete() {
//           expect(started, 'started message sent');
//           expect(result.tasks.length, 'got two result exactly').to.equal(2);
//           expect(taskSubject, 'got two subjects').to.equal(2);
//           resolve();
//         },
//       })
//     );
//   });

//   it('should support flow with single task', async function () {
//     const id = '@bit-test2/flow1';
//     const fakeFS = getTestCase(id);
//     const fakeCapsule = await createFakeCapsule(fakeFS, id);
//     const stream = new Flow(['echo hello-flow']).execute(fakeCapsule);
//     let started = false;
//     let taskSubject = false;
//     let result: any;
//     return new Promise((resolve) =>
//       stream.subscribe({
//         next(data: any) {
//           if (data.type === 'flow:start') {
//             started = true;
//           } else if (data.type === 'flow:result') {
//             result = data.value;
//           } else {
//             taskSubject = data instanceof Subject;
//           }
//         },
//         complete() {
//           expect(started, 'started message sent');
//           expect(result.tasks.length, 'got one result exactly').to.equal(1);
//           expect(taskSubject, 'got subject').to.be.true;
//           resolve();
//         },
//       })
//     );
//   });

//   it('should support empty flow', async function () {
//     const id = '@bit-test2/flow0';
//     const flow = new Flow([]);
//     const fakeCapsule = await createFakeCapsule({}, id);
//     const stream = flow.execute(fakeCapsule);
//     let gotEmptyResult = false;
//     let started = false;
//     return new Promise((resolve) =>
//       stream.subscribe({
//         next(data: any) {
//           if (data.type === 'flow:start') {
//             started = true;
//           }

//           if (data.type === 'flow:result') {
//             expect(data.value.tasks.length).to.equal(0);
//             gotEmptyResult = true;
//           }
//         },
//         complete() {
//           expect(gotEmptyResult, 'should have ended with empty result').to.be.true;
//           expect(started, 'got the flow:start message').to.be.true;
//           resolve();
//         },
//       })
//     );
//   });
//   after(function () {
//     return remove('/tmp/@bit-test2');
//   });
// });
