const BACKEND_URL = window.config.APP_BACKEND_URL;
const EDITION_URI = "xmldb:exist:///db/apps/edirom/edition-example/content/ediromEditions/edirom_edition_example.xml"; //TODO: This should not be hardcoded

function updateLayoutMetrics() {
    const root = document.documentElement;
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

    if (viewportHeight) {
        root.style.setProperty("--viewport-height", `${viewportHeight}px`);
    }

    if (header) {
        root.style.setProperty("--header-height", `${header.getBoundingClientRect().height}px`);
    }

    if (footer) {
        root.style.setProperty("--footer-height", `${footer.getBoundingClientRect().height}px`);
    }
}

function registerLayoutListeners() {
    updateLayoutMetrics();
    window.addEventListener("resize", updateLayoutMetrics);
    window.addEventListener("orientationchange", updateLayoutMetrics);
    window.addEventListener("load", updateLayoutMetrics);

    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", updateLayoutMetrics);
    }
}

registerLayoutListeners();


/**
 * Fetches JSON data from a URL and returns it as a JavaScript object
 * @param {string} url - The URL to fetch JSON from
 * @returns {Promise<any>} A promise that resolves to the parsed JSON object
 * @throws {Error} If the request fails or the response is not valid JSON
 */
async function fetchJSON(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        throw new Error(`Failed to fetch JSON from ${url}: ${error.message}`);
    }
}

async function fetchHtml(url) {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.text();
        return data;
    } catch (error) {
        throw new Error(`Failed to fetch HTML from ${url}: ${error.message}`);
    }
}

async function getConcordances(editionId, workId) {
    const concordanceData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getConcordances.xql?workId=${encodeURIComponent(workId)}&id=${encodeURIComponent(editionId)}&edition=${encodeURIComponent(editionId)}`);
    return concordanceData;
}

async function getEdition(edition_uri) {
    const editionData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getEdition.xql?id=${encodeURIComponent(edition_uri)}`);
    return editionData;
}

async function getWorks(editionId) {
    const worksData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getWorks.xql?editionId=${encodeURIComponent(editionId)}`);
    return worksData;
}

async function getNavigatorConfig(editionId, workId) {
    const navigatorConfigData = await fetchJSON(`${BACKEND_URL}/exist/apps/Edirom-Online-Backend/data/xql/getNavigatorConfig2.xql?editionId=${encodeURIComponent(editionId)}&workId=${encodeURIComponent(workId)}`);
    return navigatorConfigData;
}

function setWorkTitle(workData) {
    title = workData.title;
    document.getElementById("header-edition-name").textContent = title;
    document.title = title;

}

function buildNavigator(navigatorConfig) {
    const navigatorElement = document.createElement("div");
    navigatorElement.id = "navigator-container";

    // Recursively build the navigator structure
    function buildNavigatorRecursive(items, level = 1) {
        const container = document.createElement("div");
        container.className = `navigator-level-${level}`;

        items.forEach(item => {
            if (item.type === "navigatorCategory") {
                // Create a wrapper div for the category
                const categoryDiv = document.createElement("div");
                categoryDiv.className = `navigator-category-level-${level}`;
                categoryDiv.id = item.id;

                // Create header element with level based on depth
                const headerLevel = Math.min(level, 6); // HTML only supports h1-h6
                const header = document.createElement(`h${headerLevel}`);
                header.textContent = item.name;
                categoryDiv.appendChild(header);

                // Recursively process nested items
                if (item.items && item.items.length > 0) {
                    const nestedContainer = buildNavigatorRecursive(item.items, level + 1);
                    categoryDiv.appendChild(nestedContainer);
                }

                container.appendChild(categoryDiv);
            } else if (item.type === "navigatorItem") {
                // Create button element for navigator items
                const button = document.createElement("button");
                button.textContent = item.name;
                button.id = item.id;
                button.setAttribute("ref", item.target);
                button.className = "navigator-item-button";

                // Optional: Add click handler if needed
                button.addEventListener("click", function () {
                    // Handle navigation to target
                    console.log("Navigate to:", item.target);
                });

                container.appendChild(button);
            }
        });

        return container;
    }

    // Build the navigator from the navigatorDefinition
    if (navigatorConfig.navigatorDefinition && navigatorConfig.navigatorDefinition.length > 0) {
        const navigatorContent = buildNavigatorRecursive(navigatorConfig.navigatorDefinition);
        navigatorElement.appendChild(navigatorContent);
    }

    document.getElementById("content-container").appendChild(navigatorElement);
}

function updateNavigatorData(data) {
    const navigatorElement = document.querySelector("edirom-navigator");
    navigatorElement.setAttribute("navigator-data", JSON.stringify(data));
}

async function initializeApp() {
    const works = await getWorks(EDITION_URI);
    first_work = works[0]; //TODO: At the moment, all other works will be ignored
    setWorkTitle(first_work);

    const concordances = await getConcordances(EDITION_URI, first_work.id);
    document.querySelector("edirom-concordance-navigator").setAttribute("concordances-data", JSON.stringify(concordances));


    test_data = {
        "navigatorDefinition": [
            {
                "type": "navigatorCategory",
                "id": "navCategory-0",
                "sortNo": "1",
                "name": "Einführung",
                "items": [
                    {
                        "type": "navigatorItem",
                        "id": "navItem-0-1",
                        "sortNo": "1",
                        "name": "Allgemeines Vorwort",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/introduction/xxx.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/introduction/xxx.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-0-2",
                        "sortNo": "2",
                        "name": "Vorwort / Einleitung",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/introduction/xxx.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/introduction/xxx.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-0-3",
                        "sortNo": "3",
                        "name": "Vorbemerkungen",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/introduction/xxx.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/introduction/xxx.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-0-4",
                        "sortNo": "4",
                        "name": "Abkürzungen",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/introduction/xxx.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/introduction/xxx.xml"
                    }
                ]
            },
            {
                "type": "navigatorCategory",
                "id": "navCategory-1",
                "sortNo": "2",
                "name": "Kritischer Bericht",
                "items": [
                    {
                        "type": "navigatorItem",
                        "id": "navItem-1-1",
                        "sortNo": "1",
                        "name": "Quellenübersicht",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/xxx.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/xxx.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-1-2",
                        "sortNo": "2",
                        "name": "Quellenbeschreibung",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/source-description_op14.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/source-description_op14.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-1-3",
                        "sortNo": "3",
                        "name": "Quellenbewertung",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/xxx.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/xxx.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-1-4",
                        "sortNo": "4",
                        "name": "Textkritische Anmerkungen",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/works/a3-1_lieder-1_op09_works.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/works/a3-1_lieder-1_op09_works.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-1-5",
                        "sortNo": "5",
                        "name": "Lesarten op. 9,1: A–C",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/readings-op09-1_A-C.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/readings-op09-1_A-C.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-1-6",
                        "sortNo": "6",
                        "name": "Lesarten op. 9,1: B–C",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/readings-op09-1_B-C.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/critical-report/readings-op09-1_B-C.xml"
                    }
                ]
            },
            {
                "type": "navigatorCategory",
                "id": "navCategory-2",
                "sortNo": "3",
                "name": "Quellen",
                "items": [
                    {
                        "type": "navigatorItem",
                        "id": "navItem-2-1",
                        "sortNo": "1",
                        "name": "Sammelhandschrift I: \"Zwölf Lieder\" (1911; US-Wc, KC 25/13)",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC25-13.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC25-13.xml"
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-2-2",
                        "sortNo": "2",
                        "name": "Sammelhandschrift II: \"Drei Lieder\" (1913; US-Wc, KC 5/10)",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC05-10.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC05-10.xml"
                    },
                    {
                        "type": "navigatorCategory",
                        "id": "navCategory-2-3",
                        "sortNo": "3",
                        "name": "Nr. 1 Schneeglöckchen",
                        "items": [
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-3-1",
                                "sortNo": "1",
                                "name": "A Autographe Niederschrift 1911 (Teil von Sammelhandschrift I)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC25-13.xml#surface_c2bd57e6-4218-44d6-b294-2766cccbeb37",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC25-13.xml#surface_c2bd57e6-4218-44d6-b294-2766cccbeb37"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-3-2",
                                "sortNo": "2",
                                "name": "B Autographe Niederschrift 1913, G-Dur (US-Wc, KC 6/2)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC06-02.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC06-02.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-3-3",
                                "sortNo": "3",
                                "name": "C Erstdruck (A-Wn, MS 51588-4°/1)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MS51588-4-01.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MS51588-4-01.xml"
                            }
                        ]
                    },
                    {
                        "type": "navigatorCategory",
                        "id": "navCategory-2-4",
                        "sortNo": "4",
                        "name": "Nr. 2 Nachtwanderer",
                        "items": [
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-4-1",
                                "sortNo": "1",
                                "name": "A Autographe Niederschrift (Teil von Sammelhandschrift I)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC25-13.xml#surface_c9b4fb44-6855-4f07-9478-1b8a83dca8ad",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC25-13.xml#surface_c9b4fb44-6855-4f07-9478-1b8a83dca8ad"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-4-2",
                                "sortNo": "2",
                                "name": "Ba Kopistenabschrift es-Moll (US-Wc, KC 45/7)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-07.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-07.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-4-3",
                                "sortNo": "4",
                                "name": "Bb Kopistenabschrift d-Moll (A-Wn, Mus.Hs.36374 und 36384)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MusHs36374-84.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MusHs36374-84.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-4-4",
                                "sortNo": "5",
                                "name": "Bc Kopistenabschrift c-Moll (A-Wn, Mus.Hs.36375)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MusHs36375.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MusHs36375.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-4-5",
                                "sortNo": "6",
                                "name": "C Erstdruck (US-Wc, KC 45/6)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-06-04.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-06-04.xml"
                            }
                        ]
                    },
                    {
                        "type": "navigatorCategory",
                        "id": "navCategory-2-5",
                        "sortNo": "5",
                        "name": "Nr. 3 Das Ständchen",
                        "items": [
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-5-1",
                                "sortNo": "1",
                                "name": "A Autographe Niederschrift (Teil von Sammelhandschrift I)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC25-13.xml#surface_016e4da0-41f2-4183-b4f3-dd6313d2b71d",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC25-13.xml#surface_016e4da0-41f2-4183-b4f3-dd6313d2b71d"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-5-2",
                                "sortNo": "2",
                                "name": "B Kopistenabschrift (A-Wn, Mus.Hs.36376)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MusHs36376.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MusHs36376.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-5-3",
                                "sortNo": "3",
                                "name": "C Erstdruck (D-MZsch, RED 276a/30330.3)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/D-MZsch_RED276a-30330-3.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/D-MZsch_RED276a-30330-3.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-5-4",
                                "sortNo": "4",
                                "name": "Nachdruck von C (ca. 1925; A-Wn, MS 51588-4°/3)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MS51588-4-03.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MS51588-4-03.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-5-5",
                                "sortNo": "5",
                                "name": "D1 Nachdruck, Schott/London, Handexemplar mit hs. englischem Text (US-Wc, KC 45/6)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-06-05.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-06-05.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-5-6",
                                "sortNo": "6",
                                "name": "Ta Typoskript einer englischen Übersetzung (mit hs. Eintragungen; US-Wc, KC 45/6)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-06-05.xml#surface_53606ade-6dea-410f-83c6-95dea892bb23",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-06-05.xml#surface_53606ade-6dea-410f-83c6-95dea892bb23"
                            }
                        ]
                    },
                    {
                        "type": "navigatorCategory",
                        "id": "navCategory-2-6",
                        "sortNo": "6",
                        "name": "Nr. 4 Liebesbriefchen",
                        "items": [
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-6-1",
                                "sortNo": "1",
                                "name": "A1 Negativkopie der autographen Niederschrift (US-Wc, KC 97/7)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC97-07.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC97-07.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-6-2",
                                "sortNo": "2",
                                "name": "B Erstdruck (D-MZsch, HE 30330.4)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/D-MZsch_HE30330-4.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/D-MZsch_HE30330-4.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-6-3",
                                "sortNo": "3",
                                "name": "Nachdruck des Erstdrucks B (US-Wc, KC 45/6)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-06-06.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC45-06-06.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-6-4",
                                "sortNo": "4",
                                "name": "C Neuausgabe im Rahmen des Concordia-Albums (A-Wn, F2.Ziehrer.1505)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_F2-Ziehrer-1505.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_F2-Ziehrer-1505.xml"
                            }
                        ]
                    },
                    {
                        "type": "navigatorCategory",
                        "id": "navCategory-2-7",
                        "sortNo": "7",
                        "name": "Nr. 5 Das Heldengrab am Pruth",
                        "items": [
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-7-1",
                                "sortNo": "1",
                                "name": "A Erstdruck im Rahmen der \"Lieder eines Verwundeten\" (A-Wn; 515003-C)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_515003-C.xml#sf8444831-ade0-4205-856b-d4faa214275f",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_515003-C.xml#sf8444831-ade0-4205-856b-d4faa214275f"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-7-2",
                                "sortNo": "2",
                                "name": "B Erstdruck als op. 9,5 (A-Wn, MS 51588-4°/5)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MS51588-4-05.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MS51588-4-05.xml"
                            }
                        ]
                    },
                    {
                        "type": "navigatorCategory",
                        "id": "navCategory-2-8",
                        "sortNo": "8",
                        "name": "Nr. 6 Sommer",
                        "items": [
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-8-1",
                                "sortNo": "1",
                                "name": "A Autographe Niederschrift (Frühfassung, ergänzt zur Spätfassung; Teil von Sammelhandschrift II)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC05-10.xml#s6a1a5880-be42-46c9-921f-46c7fa622764",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/US-Wc_KC05-10.xml#s6a1a5880-be42-46c9-921f-46c7fa622764"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-2-2",
                                "sortNo": "2",
                                "name": "B Erstdruck (D-MZsch, HE 30330.6)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/D-MZsch_HE30330-6.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/D-MZsch_HE30330-6.xml"
                            },
                            {
                                "type": "navigatorItem",
                                "id": "navItem-2-5-4",
                                "sortNo": "4",
                                "name": "Nachdruck des Erstdrucks B (A-Wn, MS 51588-4°/6)",
                                "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MS51588-4-06.xml",
                                "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_MS51588-4-06.xml"
                            }
                        ]
                    },
                    {
                        "type": "navigatorItem",
                        "id": "navItem-2-16",
                        "sortNo": "16",
                        "name": "H. Kipper: \"Lieder eines Verwundeten\" (A-Wn, 515003-C)",
                        "targets": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_515003-C.xml",
                        "target": "xmldb:exist:///db/apps/edirom-content/lieder-op-09/documents/sources/A-Wn_515003-C.xml"
                    }
                ]
            }
        ]
    };

    updateNavigatorData(test_data);



    // const navigatorConfig = await getNavigatorConfig(EDITION_URI, first_work.id);
    // buildNavigator(navigatorConfig);
}

initializeApp();