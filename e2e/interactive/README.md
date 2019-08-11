Interactive tests might take a long time, so you can combine sometime different tests together by answering few questions in the same flow and test all results at once.

**Interactive tests based on the fact that you know exactly what will be asked and when. make sure to run the flow locally and write down all the inputs (arrows, enter, space, chars, etc'). an error in the inputs might lead to hanging test.

**the interactive trigger texts are exposed to changes (by chaning the question texts) be sure to expose the actual tests from the interactive implementation file and use the same in the e2e test. If it's a template, expose the template and fill it with the same values in the tests, or if it's shouldn't be change expose a constant from the file with pre-filled values.
You can see an example in the init.interactive test (DEFAULT_ENV_MSG_TEMPLATE_Q);**

If you expect some interactive process to throw an error, make sure to catch it on your own test (wrap the interactive call). 
The error message should be in `error.stderr` usually.