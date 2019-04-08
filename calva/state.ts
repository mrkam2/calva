import * as vscode from 'vscode';
import * as Immutable from 'immutable';
import * as ImmutableCursor from 'immutable-cursor';

const mode = {
    language: 'clojure',
    //scheme: 'file'
};
var data;
const initialData = {
    hostname: null,
    port: null,
    clj: null,
    cljs: null,
    shadowBuild: null,
    terminal: null,
    connected: false,
    connecting: false,
    outputChannel: vscode.window.createOutputChannel("Calva says"),
    diagnosticCollection: vscode.languages.createDiagnosticCollection('calva: Evaluation errors')
};

reset();

const cursor = ImmutableCursor.from(data, [], (nextState) => {
    data = Immutable.fromJS(nextState);
});

function deref() {
    return data;
}

// Super-quick fix for: https://github.com/BetterThanTomorrow/calva/issues/144
// TODO: Revisit the whole state management business.
function outputChannel(): vscode.OutputChannel {
    const channel = deref().get('outputChannel');
    if (channel.toJS !== undefined) {
        return channel.toJS();
    } else {
        return channel;
    }
}

function reset() {
    data = Immutable.fromJS(initialData);
}

function config() {
    let configOptions = vscode.workspace.getConfiguration('calva'),
        projectRootDirectoryConfig: string = configOptions.get("projectRootDirectory");
    return {
        format: configOptions.get("formatOnSave"),
        evaluate: configOptions.get("evalOnSave"),
        lint: configOptions.get("lintOnSave"),
        test: configOptions.get("testOnSave"),
        autoConnect: configOptions.get("autoConnect"),
        connectREPLCommand: configOptions.get("connectREPLCommand"),
        projectRootDirectory: projectRootDirectoryConfig.replace(/^\/|\/$/g, ""),
        jokerPath: configOptions.get("jokerPath"),
        useWSL: configOptions.get("useWSL"),
        syncReplNamespaceToCurrentFile: configOptions.get("syncReplNamespaceToCurrentFile")
    };
}

export {
    cursor,
    mode,
    deref,
    reset,
    config,
    outputChannel
};
