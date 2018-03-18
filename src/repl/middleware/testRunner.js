const vscode = require('vscode');
const _ = require('lodash');
const state = require('../../state');
const repl = require('../client');
const message = require('../message');
const {
    getDocument,
    getNamespace,
    getFileType,
    logSuccess,
    logError,
    logWarning,
    ERROR_TYPE,
} = require('../../utilities');

let diagnosticCollection = vscode.languages.createDiagnosticCollection('clojure4vscode');

function markTestResults(responsesArray, log = true) {
    let chan = state.deref().get('outputChannel'),
        diagnostics = {},
        total_summary = {};
    diagnosticCollection.clear();
    _.each(responsesArray, (responses) => {
        _.each(responses, response => {
            let results = response.results || null,
                summary = response.summary || null;
            if (results !== null) {
                _.each(results, (tests, ns) => {
                    _.each(tests, (asserts, test) => {
                        _.each(asserts, a => {
                            if (a.type == "error") {
                                if (log) {
                                    chan.appendLine("ERROR in: " + ns + ": " + a.file + ", line " + a.line +
                                        ": " + test + ": " + (a.context || "") + ":\n" +
                                        "  error: " + a.error + "\n  expected: " + a.expected);
                                }
                            }
                            if (a.type == "fail") {
                                let msg = "failure in test: " + test +
                                    " context: " + a.context + ", expected " +
                                    a.expected + ", got: " + a.actual,
                                    err = new vscode.Diagnostic(new vscode.Range(a.line - 1, 0, a.line - 1, 1000),
                                        msg,
                                        vscode.DiagnosticSeverity.Error);
                                if (!diagnostics[a.file]) {
                                    diagnostics[a.file] = [];
                                }
                                diagnostics[a.file].push(err);
                                if (log) {
                                    chan.appendLine("FAIL in: " + a.file + ":" + a.line +
                                        ": " + test + ": " + (a.context || "") + ":\n" +
                                        "  expected: " + a.expected + "\n  actual: " + a.actual);
                                }
                            }
                        })
                    })
                })
            }
            if (summary !== null) {
                _.each(summary, (v, k) => {
                    total_summary[k] = summary[k] + (total_summary[k] !== undefined ? total_summary[k] : 0);
                });
            }
        });
    });
    if (total_summary !== null) {
        let hasProblems = total_summary.error + total_summary.fail > 0;
        if (log) {
            chan.appendLine("\n" + (total_summary.test > 0 ?
                total_summary.test + " tests finished, " +
                (!hasProblems ? "all passing 👍" :
                    "problems found. 😭" +
                    " errors: " + total_summary.error + ", failures: " + total_summary.fail) :
                "No tests found. 😱") +
                ", ns: " + total_summary.ns + ", vars: " + total_summary.var);
        }

        if (total_summary.test > 0) {
            if (hasProblems) {
                _.each(diagnostics, (errors, fileName) => {
                    if (fileName.startsWith('/')) {
                        diagnosticCollection.set(vscode.Uri.file(fileName), errors);
                    }
                    else {
                        // Sometimes we don't get the full path for some reason. (This is a very inexact
                        // way of dealing with that. Maybe check for the right `ns`in the file?)
                        vscode.workspace.findFiles('**/' + fileName, undefined).then((uri) => {
                            diagnosticCollection.set(uri[0], errors);
                        });
                    }
                });
            }
        }
    }
};

function runTests(messages, startStr, errorStr, log = true, document = {}) {
    let current = state.deref(),
        doc = getDocument(document),
        session = current.get(getFileType(doc));

    if (current.get('connected')) {
        chan = current.get('outputChannel');
        if (log) {
            chan.appendLine(startStr);
            chan.appendLine("----------------------------");
        }
        let testClient = null,
            results = [],
            errors = 0,
            exceptions = 0;

        // It seems we cannot set up two connections, lest they get mixed up.
        // Thus we only send new messages when a message has returned.
        (function loop(i) {
            new Promise((resolve, reject) => {
                testClient = repl.create().once('connect', () => {
                    testClient.send(messages[i], (result) => {
                        exceptions += _.some(result, "ex");
                        errors += _.some(result, "err");
                        if (!exceptions && !errors) {
                            resolve(result);
                        } else {
                            logError({
                                type: ERROR_TYPE.ERROR,
                                reason: "Error " + errorStr + ":" + _.find(result, "err").err
                            });
                            reject(result);
                        }
                    });
                });
            }).then((result) => {
                testClient.end();
                results.push(result);
                if (i < messages.length - 1) {
                    loop(i + 1);
                } else {
                    markTestResults(results);
                }
            }).catch(() => {
                testClient.end();
            });
        })(0);
    }
}

function runAllTests(document = {}) {
    let current = state.deref(),
        doc = getDocument(document),
        session = current.get(getFileType(doc)),
        msg = message.testAll(session);

    runTests([msg], "Running all tests", "running all tests");
};

function getNamespaceTestMessages(document = {}) {
    let current = state.deref(),
        doc = getDocument(document),
        session = current.get(getFileType(doc)),
        ns = getNamespace(doc.getText()),
        messages = [message.test(session, ns)];

    if (!ns.endsWith('-test')) {
        messages.push(message.test(session, ns + '-test'));
    }
    return messages;
}
function runNamespaceTests(document = {}) {
    runTests(getNamespaceTestMessages(), "Running tests", "running tests");
};

module.exports = {
    runNamespaceTests,
    runAllTests
};