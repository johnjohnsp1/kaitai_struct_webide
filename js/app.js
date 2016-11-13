/// <reference path="../lib/ts-types/goldenlayout.d.ts" />
/// <reference path="../node_modules/typescript/lib/lib.es6.d.ts" />
var baseUrl = location.href.split('?')[0].split('/').slice(0, -1).join('/') + '/';
var dataProvider;
var itree;
function compile(srcYaml, kslang, debug) {
    var src;
    try {
        src = YAML.parse(srcYaml);
    }
    catch (parseErr) {
        showError("YAML parsing error: ", parseErr);
        return;
    }
    try {
        var ks = io.kaitai.struct.MainJs();
        var rRelease = (debug === false || debug === 'both') ? ks.compile(kslang, src, false) : null;
        var rDebug = (debug === true || debug === 'both') ? ks.compile(kslang, src, true) : null;
        return rRelease && rDebug ? { debug: rDebug, release: rRelease } : rRelease ? rRelease : rDebug;
    }
    catch (compileErr) {
        console.log(compileErr.s$1);
        showError("KS compilation error: ", compileErr);
        return;
    }
}
function isKsyFile(fn) { return fn.toLowerCase().endsWith('.ksy'); }
$(() => {
    ui.infoPanel.getElement().show();
    ui.hexViewer.onSelectionChanged = () => {
        ui.infoPanel.getElement().text(ui.hexViewer.selectionStart == -1 ? 'no selection' : `selection: 0x${ui.hexViewer.selectionStart.toString(16)} - 0x${ui.hexViewer.selectionEnd.toString(16)}`);
        if (itree && ui.hexViewer.selectionStart) {
            var intervals = itree.search(ui.hexViewer.selectionStart);
            console.log('intervals', intervals);
        }
    };
    ui.hexViewer.onSelectionChanged();
    ui.genCodeDebugViewer.commands.addCommand({
        name: "compile",
        bindKey: { win: "Ctrl-Enter", mac: "Command-Enter" },
        exec: function (editor) { reparse(); }
    });
    initFileDrop('fileDrop', files => {
        Promise.all(files.map((file, i) => {
            return (isKsyFile(file.file.name) ? file.read('text') : file.read('arrayBuffer')).then(content => {
                return localFs.put(file.file.name, content).then(fsItem => {
                    return files.length == 1 ? loadFsItem(fsItem) : Promise.resolve();
                });
            });
        })).then(refreshFsNodes);
    });
    var lastKsyContent;
    function loadFsItem(fsItem, refreshGui = true) {
        if (!fsItem || fsItem.type !== 'file')
            return Promise.resolve();
        return fss[fsItem.fsType].get(fsItem.fn).then(content => {
            if (isKsyFile(fsItem.fn)) {
                localforage.setItem('ksyFsItem', fsItem);
                lastKsyContent = content;
                ui.ksyEditor.setValue(content, -1);
                return Promise.resolve();
            }
            else {
                localforage.setItem('inputFsItem', fsItem);
                dataProvider = {
                    length: content.byteLength,
                    get(offset, length) { return new Uint8Array(content, offset, length); },
                };
                ui.hexViewer.setDataProvider(dataProvider);
                return jailrun('inputBuffer = args; void(0)', content).then(() => refreshGui ? reparse() : Promise.resolve());
            }
        });
    }
    ui.fileTreeCont.getElement().bind("dblclick.jstree", function (event) {
        loadFsItem(ui.fileTree.get_node(event.target).data);
    });
    function recompile() {
        return localforage.getItem('ksyFsItem').then(ksyFsItem => {
            var srcYaml = ui.ksyEditor.getValue();
            var changed = lastKsyContent !== srcYaml;
            var copyPromise = changed && ksyFsItem.fsType === 'kaitai' ?
                fss.local.put(ksyFsItem.fn.split('/').last().replace('.ksy', '_modified.ksy'), srcYaml).then(fsItem => {
                    ksyFsItem = fsItem;
                    return localforage.setItem('ksyFsItem', fsItem);
                }).then(refreshFsNodes) : Promise.resolve();
            return copyPromise.then(() => changed ? fss[ksyFsItem.fsType].put(ksyFsItem.fn, srcYaml) : Promise.resolve()).then(() => {
                var compiled = compile(srcYaml, 'javascript', 'both');
                ui.genCodeViewer.setValue(compiled.release[0], -1);
                ui.genCodeDebugViewer.setValue(compiled.debug[0], -1);
                return reparse();
            });
        });
    }
    function reparse() {
        var jsTree = ui.parsedDataTreeCont.getElement();
        jsTree.jstree("destroy");
        return Promise.all([jailReady, inputReady, formatReady]).then(() => {
            var debugCode = ui.genCodeDebugViewer.getValue();
            return jailrun(`module = { exports: true }; \n ${debugCode} \n`);
        }).then(() => {
            console.log('recompiled');
            jail.remote.reparse((res, error) => {
                window['parseRes'] = res;
                console.log('reparse res', res);
                itree = new IntervalTree(dataProvider.length / 2);
                handleError(error);
                parsedToTree(jsTree, res, handleError).on('select_node.jstree', function (e, node) {
                    //console.log('select_node', node);
                    var debug = node.node.data.debug;
                    if (debug)
                        ui.hexViewer.setSelection(debug.start, debug.end - 1);
                });
            });
        });
    }
    function loadCachedFsItem(cacheKey, defSample) {
        return localforage.getItem(cacheKey).then((fsItem) => loadFsItem(fsItem || { fsType: 'kaitai', fn: `${defSample}`, type: 'file' }, false));
    }
    var inputReady = loadCachedFsItem('inputFsItem', 'samples/sample1.zip');
    var formatReady = loadCachedFsItem('ksyFsItem', 'formats/archive/zip.ksy');
    var editDelay = new Delayed(500);
    ui.ksyEditor.on('change', () => editDelay.do(() => recompile()));
});
//# sourceMappingURL=app.js.map