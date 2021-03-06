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
 * @property { {language: string, word: string}[] } source
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
        this.actionsBar = new ActionsBar(this.lookupHistory);
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

    _setup() {
        this.append(
            this.actionsBar,
            this.lookupHistory,
            this.lookupContainer = new Elm().class("lookupContainer")
        );

        const firstLookup = this._createLookup();
        setTimeout(() => firstLookup.focus(), 1);
    }

    /** @param {string} [presetSearch] */
    _createLookup(presetSearch) {
        const lookup = new Lookup(presetSearch).appendTo(this.lookupContainer);
        lookup.focus();

        lookup.setReturnHandler(a => {
            console.log(a);
            lookup.remove();
            this.lookupHistory.addLookup(a);
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
        /** @type {function[]} */
        this.changeHandlers = [];
    }

    /**
     * @param {JishoData} lookup 
     */
    addLookup(lookup) {
        const lookupElm = new LookupResult(lookup);

        new LookupResultRemoveButton(lookupElm)
            .appendTo(lookupElm)
            .setClickHandler(() => this.removeLookup(lookupElm));

        this.lookups.push(lookupElm);
        this.append(lookupElm);
        this._dispatchChangeHandlers();
    }

    /**
     * @param {LookupResult} lookup
     */
    removeLookup(lookup) {
        this.lookups.splice(this.lookups.indexOf(lookup), 1);
        lookup.remove();
        this._dispatchChangeHandlers();
    }

    clearLookups() {
        this.clear();
        this.lookups.length = 0;
        this._dispatchChangeHandlers();
    }

    /** @param {function} handler */
    addChangeHandler(handler) {
        this.changeHandlers.push(handler);
    }

    _dispatchChangeHandlers() {
        for (const handler of this.changeHandlers) {
            handler();
        }
    }

    getData() {
        return this.lookups.map(e => e.data);
    }
}

class ActionsBar extends Component {
    /**
     * @param {LookupHistory} history
     */
    constructor(history) {
        super("actionsBar");

        this.history = history;

        this.append(
            new Elm().class("left").append(
                this.clearAllButton = new Elm("button").class("clearAllButton", "shadow")
                    .on("click", () => this.history.clearLookups())
            ),

            new Elm().class("right").append(
                new Elm("button").class("exportButton", "shadow").append("Export")
                    .on("click", () => {
                        const modal = new Modal();
                        modal.appendContent(
                            new Elm("textarea")
                                .attribute("readonly") // @ts-ignore
                                .on("click", function () { this.select(); })
                                .append(JSON.stringify(this.history.getData()))
                        );
                        modal.show();
                    }),

                new Elm("button").class("importButton", "shadow").append("Import")
                    .on("click", () => {
                        const modal = new Modal();
                        const textarea = new Elm("textarea")
                            .attribute("placeholder", "Import JSON...");

                        modal.appendContent(textarea);
                        modal.addButton(new Elm("button").append("Import")
                            .on("click", () => {
                                /** @type {string} */
                                // @ts-ignore
                                const data = textarea.elm.value;
                                if (!data) { return; }
                                const obj = JSON.parse(data);
                                for (const item of obj) {
                                    this.history.addLookup(item);
                                }
                            })
                        );

                        modal.show();
                        textarea.elm.focus();
                    })
            )
        );

        this.updateHistoryCount();
        this.history.addChangeHandler(() => this.updateHistoryCount(this.history.getData().length));
    }

    /**
     * @param {number} [count]
     */
    updateHistoryCount(count) {
        if (count) {
            this.clearAllButton.elm.innerHTML = "Clear all (" + count + ")";
        } else {
            this.clearAllButton.elm.innerHTML = "Clear all";
        }
    }
}

class Lookup extends Component {
    /**
     * @typedef {(ret: JishoData) => any} LookupReturnHandler
     */

    /** @param {string} [searchString] */
    constructor(searchString) {
        super("lookup");

        this.presetSearch = searchString;

        this.input = this._createInput();
        this.lastInputValue = null;

        /** @type {LookupReturnHandler} */
        this.returnHandler = null;

        /** @type {Elm} */
        this.lastLookupResults = null;

        this.hasProxyWarning = false;

        this.append(this.input);

        if (searchString) {
            /** @type {HTMLInputElement} */ // @ts-ignore
            const input = this.input.elm;
            input.value = searchString;
            this._makeLookup(searchString);
        }
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
            .on("keydown", e => this._inputEnterHandler(e));
    }

    /**
     * @param {KeyboardEvent} e 
     */
    _inputEnterHandler(e) {
        /** @type {HTMLInputElement} */ // @ts-ignore
        const input = this.input.elm;
        console.log(e);

        if (
            !(e.keyCode === 13 || e.key === "Enter") ||
            this.lastInputValue === input.value
        ) {
            return;
        }

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

        this._removeLastLookup(); // do it again in case results have been added since
        const lookupResults = new Elm().class("lookupResults").appendTo(this);

        for (const item of result.data) {
            new LookupResult(item)
                .appendTo(lookupResults)
                .setClickHandler(() => this.returnHandler(item));
        }

        this.lastLookupResults = lookupResults;
        this.lastInputValue = inputValue;

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
        this.wordToJapaneseMap = this._getWordToJapaneseMap();

        /** @type {function} */
        this.clickHandler = null;

        this._setupElm();
    }

    /**
     * @param {function} handler 
     */
    setClickHandler(handler) {
        this.clickHandler = handler;
        this.class("clickable", "shadow");
    }

    _setupElm() {
        this.attribute("tabindex", "0").append(
            new Elm().class("top").append(
                new Elm("h1").class("word").append(
                    new Furigana(this.data.japanese[0])
                ),

                new Elm().class("tags").withSelf(self => this._addTagsTo(self))
            ),
            new Elm("ol").class("senses").append(
                new Elm().withSelf(self => this._addDefinitionsTo(self))
            )
        );

        this.onActivate(() => this._onSelected());

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
        const groups = this._getSensesGroupedByRestrictions();

        for (const group of groups) {
            const groupElm = new Elm().class("group");

            if (this.data.japanese.length > 1) { // more than one form?
                this._createGroupHeading(group).appendTo(groupElm);
            }

            for (const sense of group.senses) {
                this._createSenseListItem(sense).appendTo(groupElm);
            }

            elm.append(groupElm);
        }
    }

    /**
     * @typedef {{ restrictions: string[], senses: Sense[] }} RestrictionGroup
     */

    /** @returns {RestrictionGroup[]} */
    _getSensesGroupedByRestrictions() {
        const groups = [];

        for (const sense of this.data.senses) {
            let thisGroup = null;
            for (const group of groups) {
                if (arrayEquals(group.restrictions, sense.restrictions)) {
                    thisGroup = group;
                    break;
                }
            }

            if (thisGroup === null) {
                thisGroup = {
                    restrictions: sense.restrictions,
                    /** @type {Sense[]} */
                    senses: []
                };
                groups.push(thisGroup);
            }

            thisGroup.senses.push(sense);
        }

        return groups;
    }

    /** @returns {Map<string, Japanese>} */
    _getWordToJapaneseMap() {
        const wordToJapaneseMap = new Map();
        for (const word of this.data.japanese) {
            wordToJapaneseMap.set(word.word || word.reading, word);
        }
        return wordToJapaneseMap;
    }

    /** @param {RestrictionGroup} group */
    _createGroupHeading(group) {
        const groupHeading = new Elm("h3").class("groupHeading");

        /** @type {Japanese[]} */
        const restrictions =
            group.restrictions.length > 0 ?
                group.restrictions.map(e => this.wordToJapaneseMap.get(e) || { reading: e }) :
                this.data.japanese;

        const groupHeadingText = new Elm().class("text").appendTo(groupHeading);

        for (const restrictionJapanese of restrictions) {
            const furigana = new Furigana(restrictionJapanese);
            groupHeadingText.append(
                furigana,
                new Elm("span").class("separator").append("\u30FB")
            );

            if (restrictionJapanese.reading === this.data.japanese[0].reading) {
                furigana.hideReading();
            }
        }

        return groupHeading;
    }

    /** @param {Sense} sense */
    _createSenseListItem(sense) {
        const senseElm = new Elm("li").class("sense");

        new Elm("span").class("definitions")
            .append(sense.english_definitions.join("; "))
            .appendTo(senseElm);

        if (sense.see_also.length > 0) {
            this._createSeeAlsoElm(sense.see_also).appendTo(senseElm);
        }

        this._createInfoElm(sense).appendTo(senseElm);

        if (sense.tags.length > 0) { // has tags?
            const tags = new Elm().class("tags").appendTo(senseElm);

            for (const tag of sense.tags) {
                if (tag === "Usually written using kana alone") {
                    tags.appendAsFirst(
                        this._createTagElm("u.kana")
                            .attribute("title", tag)
                            .class("ukana")
                    );
                } else {
                    tags.append(this._createTagElm(tag));
                }
            }
        }

        return senseElm;
    }

    /** @param {string[]} seeAlsos */
    _createSeeAlsoElm(seeAlsos) {
        const seeAlsosElm = new Elm().class("seeAlsos");

        for (const seeAlso of seeAlsos) {
            new Elm().class("seeAlso")
                .append(seeAlso)
                .on("click", e => {
                    const modal = new Modal();
                    const lookup = new Lookup(seeAlso);
                    lookup.setReturnHandler(result => {
                        main.lookupHistory.addLookup(result);
                        modal.remove();
                    });

                    modal.appendContent(lookup);
                    modal.show();
                    e.stopPropagation();
                })
                .appendTo(seeAlsosElm);
        }

        return seeAlsosElm;
    }

    /** @param {Sense} sense */
    _createInfoElm(sense) {
        // sense.antonyms
        // sense.info
        // sense.parts_of_speech
        // sense.source

        const infoElmContainer = new Elm().class("infoElmContainer");
        const infoElm = new Elm().class("infoElm", "shadow", "tooltip").appendTo(infoElmContainer);
        let important = false;

        if (sense.parts_of_speech.length > 0) {
            infoElm.append(new Elm("i").append(sense.parts_of_speech.join(", ")));
        }
        if (sense.antonyms.length > 0) {
            infoElm.append(new Elm().append(
                new Elm("b").append("Antonyms: "),
                sense.antonyms.join("; ")
            ));
        }
        if (sense.info.length > 0) {
            important = true;

            infoElm.append(new Elm().append(
                new Elm("b").append("Info: "),
                sense.info.join("; ")
            ));
        }
        if (sense.source.length > 0) {
            infoElm.append(new Elm().append(
                new Elm("b").append("Source: "),
                sense.source.map(e => e.language + " " + e.word).join("; ")
            ));
        }

        if (important) {
            infoElmContainer.class("important");
            infoElmContainer.append(new Elm("sup").append(
                new Elm().append("i").class("infoIndicator")
            ));
        }

        return infoElmContainer;
    }

    /**
     * @param {string} text 
     */
    _createTagElm(text) {
        return new Elm().class("tag").append(text);
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
                .onActivate(() => this._onClick())
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

class Furigana extends Component {
    /**
     * @param {Japanese} item 
     */
    constructor(item) {
        super("furigana");
        if (item.word) {
            this.append(
                new Elm("ruby").class("word")
                    .append(
                        item.word,
                        new Elm("rp").class("reading").append("("),
                        new Elm("rt").class("reading").append(item.reading),
                        new Elm("rp").class("reading").append(")")
                    )
            );
        } else {
            this.append(
                new Elm("span").class("word").append(item.reading)
            );
        }
    }

    hideReading() {
        this.class("hideReading");
    }
}

class Modal extends Component {
    constructor() {
        super("modal");

        this.append(
            new Elm().class("dialogue").append(
                this.content = new Elm().class("content"),

                this.buttons = new Elm().class("buttons").append(
                    this.closeButton = new Elm("button").class("close").append("Close")
                        .on("click", () => this.remove())
                )
            )
        );
    }

    /**
     * @param {any} content 
     */
    appendContent(content) {
        this.content.append(content);
    }

    /**
     * @param {Elm} button
     */
    addButton(button) {
        button.appendTo(this.buttons);
        button.on("click", () => this.remove());
        this.closeButton.elm.innerHTML = "Cancel";
    }

    show() {
        this.appendTo(document.body);
    }
}

/**
 * @template T
 * @param {T[]} arr1
 * @param {T[]} arr2
 * @return {boolean}
 */
function arrayEquals(arr1, arr2) {
    if (arr1.length !== arr2.length) { return false; }

    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) { return false; }
    }

    return true;
}

const main = new Main();
main.appendTo(document.body);
console.log(main);

history.scrollRestoration = "manual";

if (/\sElectron\//.test(navigator.userAgent) && window.require) {
    addEventListener("keydown", e => {
        if (e.key.toLowerCase() === "r" && e.ctrlKey) {
            location.reload();
        } else if (e.key.toLowerCase() === "i" && e.ctrlKey && e.shiftKey) {
            require("electron").remote.getCurrentWindow().webContents.openDevTools();
        }
    });
}

