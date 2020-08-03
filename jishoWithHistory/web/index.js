import { Elm, Component } from "./elements.js";

/**
 * @typedef {Object} JishoApiData
 * @property {JishoData[]} data
 * @property { { status: number } } meta
 * 
 * @typedef {Object} JishoData
 * @property {string} slug
 * @property {boolean} [is_common]
 * @property {string[]} jlpt
 * @property {string[]} tags
 * @property {Sense[]} senses
 * @property {Japanese[]} japanese
 * 
 * @typedef {Object} Sense
 * @property {string[]} english_definitions
 * @property {string[]} antonyms
 * @property {string[]} info
 * @property { {text: string, url: string}[] } links
 * @property {string[]} parts_of_speech
 * @property {string[]} restrictions
 * @property {string[]} see_also
 * @property {string[]} source
 * @property {string[]} tags
 * 
 * @typedef {Object} Japanese
 * @property {string} [word]
 * @property {string} reading
 */

class Main extends Component {
    constructor() {
        super("main");

        this.lookupHistory = new LookupHistory();
        this.actionsBar = new ActionsBar(this);
        /** @type {Elm} */
        this.lookupContainer = null;

        this._setup();
    }

    clearAll() {
        this.lookupHistory.clearLookups();
    }

    getHistory() {
        return this.lookupHistory.getData();
    }

    /**
     * @param {JishoData} item 
     */
    addItemToHistory(item) {
        const lookupElm = new LookupResult(item);

        new LookupResultRemoveButton(lookupElm)
            .appendTo(lookupElm)
            .setClickHandler(() => this.lookupHistory.removeLookup(lookupElm));

        this.lookupHistory.addLookup(lookupElm);
    }

    _setup() {
        this.append(
            this.actionsBar,
            this.lookupHistory,
            this.lookupContainer = new Elm().class("lookupContainer")
        );

        const firstLookup = this._createLookup();
        setTimeout(() => firstLookup.focus(), 1);
    }

    _createLookup() {
        const lookup = new Lookup().appendTo(this.lookupContainer);
        lookup.focus();

        lookup.setReturnHandler(a => {
            console.log(a);
            lookup.remove();
            this.addItemToHistory(a);
            this._createLookup();
        });

        return lookup;
    }
}

class LookupHistory extends Component {
    constructor() {
        super("lookupHistory");
        /** @type {LookupResult[]} */
        this.lookups = [];
    }

    /**
     * @param {LookupResult} lookup 
     */
    addLookup(lookup) {
        this.lookups.push(lookup);
        this.append(lookup);
    }

    /**
     * @param {LookupResult} lookup
     */
    removeLookup(lookup) {
        this.lookups.splice(this.lookups.indexOf(lookup), 1);
        lookup.remove();
    }

    clearLookups() {
        this.clear();
        this.lookups.length = 0;
    }

    getData() {
        return this.lookups.map(e => e.data);
    }
}

class ActionsBar extends Component {
    /**
     * @param {Main} main
     */
    constructor(main) {
        super("buttonsBar");

        this.parentMain = main;

        this.append(
            new Elm("button").class("clearAllButton", "shadow").append("Clear All")
                .on("click", () => this.parentMain.clearAll()),

            new Elm("button").class("exportButton", "shadow").append("Export")
                .on("click", () => {
                    alert(JSON.stringify(this.parentMain.getHistory()));
                }),

            new Elm("button").class("importButton", "shadow").append("Import")
                .on("click", () => {
                    const data = prompt("Import JSON...");
                    if (!data) { return; }
                    const obj = JSON.parse(data);
                    for (const item of obj) {
                        this.parentMain.addItemToHistory(item);
                    }
                })
        );
    }
}

class Lookup extends Component {
    /**
     * @typedef {(ret: JishoData) => any} LookupReturnHandler
     */

    constructor() {
        super("lookup");

        this.input = this._createInput();

        /** @type {LookupReturnHandler} */
        this.returnHandler = null;
        /** @type {Elm} */
        this.lastLookupResults = null;

        this.hasProxyWarning = false;

        this.append(this.input);
    }

    /**
     * @param {LookupReturnHandler} handler 
     */
    setReturnHandler(handler) {
        this.returnHandler = handler;
    }

    focus() {
        this.input.elm.focus();
        scrollTo(0, document.body.scrollHeight);
        scrollBy(0, -1); // prevent browser scrolling back
        scrollBy(0, 1);
    }

    _createInput() {
        return new Elm("input")
            .class("input", "shadow")
            .attribute("autofocus")
            .attribute("placeholder", "Search...")
            .on("change", () => this._inputChangeHandler());
    }

    _inputChangeHandler() {
        /** @type {HTMLInputElement} */
        // @ts-ignore
        const input = this.input.elm;
        this._removeLastLookup();
        this._makeLookup(input.value);
    }

    _removeLastLookup() {
        if (this.lastLookupResults) {
            this.lastLookupResults.remove();
        }
    }

    /**
     * @param {string} inputValue
     */
    async _makeLookup(inputValue) {
        if (!inputValue) { return; }
        const encodedInputValue = encodeURIComponent(inputValue);
        const url = "https://jisho.org/api/v1/search/words?keyword=" + encodedInputValue;

        /** @type {JishoApiData} */
        const result = await this._requestMaybeUsingProxy(url).then(e => e.json());
        if (result.meta.status !== 200) { throw new Error("Unexpected status " + result.meta.status); }

        const lookupResults = new Elm().class("lookupResults").appendTo(this);

        for (const item of result.data) {
            new LookupResult(item)
                .appendTo(lookupResults)
                .setClickHandler(() => this._resultSelectedHandler(item));
        }

        this.lastLookupResults = lookupResults;

        console.log(result);
    }

    /**
     * @param {string} url 
     */
    async _requestMaybeUsingProxy(url) {
        if (Lookup.useProxy) {
            this._showProxyWarning();
            return fetch(Lookup.getProxyUrl(url));
        }

        try {
            return await fetch(url);
        } catch (err) {
            if (err.name !== "TypeError") {
                throw err;
            }

            Lookup.useProxy = true;
            this._showProxyWarning();
            return fetch(Lookup.getProxyUrl(url));
        }
    }

    _showProxyWarning() {
        if (this.hasProxyWarning) { return; }
        this.append(new ProxyWarning());
        this.hasProxyWarning = true;
    }

    /**
     * @param {JishoData} item
     */
    _resultSelectedHandler(item) {
        this.returnHandler(item);
    }
}

Lookup.useProxy = false;

/**
 * Converts url to a url that passes though a proxy,
 * allowing bypass of CORS
 * @param {string} url 
 */
Lookup.getProxyUrl = function (url) {
    return "https://cors-anywhere.herokuapp.com/" + url;
};

class ProxyWarning extends Component {
    constructor() {
        super("proxyWarning");

        /** @type {Elm} */
        this.tooltipElm = null;

        this._setup();
    }

    _setup() {
        this.append(
            new Elm().class("badge")
                .attribute("tabindex", "0")
                .append(
                    new Elm("span").class("triangle").append("\u25b2"),
                    new Elm("span").append("Proxy")
                )
                .on("click", () => this._showTooltip())
                .on("mouseover", () => this._showTooltip())
                .on("mouseout", () => this._hideTooltip())
                .on("focus", () => this._showTooltip())
                .on("blur", () => this._hideTooltip()),

            this.tooltipElm = new Elm().class("tooltip", "shadow")
                .append(
                    new Elm().append("Requests to jisho.org are being passed though a third party proxy (" + Lookup.getProxyUrl("") + ")."),
                    new Elm().append("Searches will be slower."),
                    new Elm().append("Use electron-based desktop app to avoid using a proxy.")
                )
        );
    }

    _showTooltip() {
        this.tooltipElm.class("show");
    }

    _hideTooltip() {
        this.tooltipElm.removeClass("show");
    }
}

class LookupResult extends Component {
    /**
     * @param {JishoData} data 
     */
    constructor(data) {
        super("lookupResult");

        this.data = data;

        /** @type {function} */
        this.clickHandler = null;

        this._setup();
    }

    /**
     * @param {function} handler 
     */
    setClickHandler(handler) {
        this.clickHandler = handler;
        this.class("clickable", "shadow");
    }

    _setup() {
        let title = "";
        let reading = "";

        const firstJapanese = this.data.japanese[0];
        if (firstJapanese.word) {
            title = firstJapanese.word;
            reading = firstJapanese.reading;
        } else {
            title = firstJapanese.reading;
        }

        this.attribute("tabindex", "0").append(
            new Elm().class("top").append(
                new Elm().class("word").append(
                    new Elm().class("reading").append(reading),
                    new Elm().class("title").append(title),
                ),

                new Elm().class("tags").withSelf(self => this._addTagsTo(self))
            ),
            new Elm("ol").class("senses").append(
                new Elm().withSelf(self => this._addDefinitionsTo(self))
            )
        );

        this.elm.addEventListener("keydown", e => this._clickByKeyboardHandler(e));
        this.on("click", () => this._onSelected());

        if (this.data.is_common) {
            this.class("common");
        }
    }

    /**
     * @param {Elm} elm 
     */
    _addTagsTo(elm) {
        for (const tags of [this.data.tags, this.data.jlpt]) {
            for (const tag of tags) {
                this._createTagElm(tag).appendTo(elm);
            }
        }

        if (this.data.is_common) {
            this._createTagElm("common word").class("common").appendTo(elm);
        }
    }

    /**
     * @param {Elm} elm 
     */
    _addDefinitionsTo(elm) {
        for (const sense of this.data.senses) {
            elm.append(
                new Elm("li").class("sense").append(
                    sense.english_definitions.join("; ")
                )
            );
        }
    }

    /**
     * @param {string} text 
     */
    _createTagElm(text) {
        return new Elm().class("tag").append(text);
    }

    /**
     * @param {KeyboardEvent} e 
     */
    _clickByKeyboardHandler(e) {
        if (e.keyCode === 13 || e.keyCode === 32) { // enter or space
            this._onSelected();
            e.preventDefault();
        }
    }

    _onSelected() {
        if (this.clickHandler) {
            this.clickHandler();
        }
    }
}

class LookupResultRemoveButton extends Component {
    /**
     * @param {LookupResult} lookupResult lookupResult to add button to
     */
    constructor(lookupResult) {
        super("lookupResultRemoveButton");
        this.lookupResult = lookupResult;
        /** @type {function} */
        this.clickHandler = null;
        this._setup();
    }

    /** @param {function} handler */
    setClickHandler(handler) {
        this.clickHandler = handler;
    }

    _setup() {
        this.append(
            new Elm().class("hitbox").attribute("tabindex", "0")
                .on("click", () => this._onClick())
                .append(
                    new Elm().class("imgContainer", "shadow").append(
                        new Elm().class("deleteButtonImg")
                    )
                )
        );
    }

    _onClick() {
        if (this.clickHandler) { this.clickHandler(); }
    }
}


const main = new Main();
main.appendTo(document.body);
console.log(main);

history.scrollRestoration = "manual";

if (/\sElectron\//.test(navigator.userAgent) && window.require) {
    addEventListener("keydown", e => {
        if (e.keyCode === 82 && e.ctrlKey) {
            location.reload();
        } else if (e.keyCode === 73 && e.ctrlKey && e.shiftKey) {
            require("electron").remote.getCurrentWindow().webContents.openDevTools();
        }
    });
}

