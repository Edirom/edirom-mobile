import { appState } from "./config.js";
import { buildNavigator, navigateBackInNavigator } from "./navigator.js";
import { getAllEditions } from "./api.js";
import { initEdition } from "./main.js";
import { resetContentLoadingState } from "./loading.js";

// Flag to skip the next popstate event (set when we call history.go(1) ourselves)
let skipNextPopstate = false;

// Handler for beforeunload event - shows browser's native "Leave site?" dialog
/**
 * Triggers the browser's native "Leave site?" dialog on page unload.
 */
function handleBeforeUnload(event) {
    event.preventDefault();
    event.returnValue = '';
    return '';
}

/**
 * Dispatches a cancelable 'back-request' event to web components, allowing them
 * to handle back navigation internally (e.g., closing a detail view).
 * @returns {boolean} true if a component handled the back request
 */
function requestComponentsBackHandling() {
    // First pass: global components outside #content-container (header, footer)
    // that declare they can handle back navigation (e.g. open popovers).
    const globalTargets = document.querySelectorAll('[data-handles-back-request]');
    for (const target of globalTargets) {
        const backRequestEvent = new CustomEvent("back-request", {
            cancelable: true,
            bubbles: true,
            composed: true
        });
        target.dispatchEvent(backRequestEvent);
        if (backRequestEvent.defaultPrevented) {
            return true;
        }
    }

    // Second pass: content-area web components (e.g. annotation view detail page).
    const contentContainer = document.getElementById("content-container");
    if (!contentContainer) return false;

    const targets = contentContainer.querySelectorAll(".web-component");
    if (!targets || targets.length === 0) return false;

    for (const target of targets) {
        const backRequestEvent = new CustomEvent("back-request", {
            cancelable: true,
            bubbles: true,
            composed: true
        });
        target.dispatchEvent(backRequestEvent);
        if (backRequestEvent.defaultPrevented) {
            return true;
        }
    }
    return false;
}

/**
 * Switches the app to a new page, managing content, state, and browser history.
 * @param {string} pageName - The name of the page to switch to
 * @param {HTMLElement|Promise<HTMLElement>} newContent - The content to display
 * @param {Object} options - History management options
 * @param {boolean} options.pushState - Whether to push a new history entry (default: true)
 * @param {boolean} options.replaceState - Whether to replace the current history entry (default: false)
 */
export async function switchPage(pageName, newContent, { pushState = true, replaceState = false } = {}) {
    console.log("Switching to page:", pageName, "with options:", { pushState, replaceState });

    const resolvedContent = await newContent;

    const contentContainer = document.getElementById("content-container");
    contentContainer.innerHTML = "";
    contentContainer.appendChild(resolvedContent);
    appState.page = pageName;

    const concordanceWrapper = document.getElementById("concordance-navigator-wrapper");
    if (concordanceWrapper) {
        const showConcordance = pageName === "navigator" || pageName === "views";
        concordanceWrapper.style.display = showConcordance ? "" : "none";
        if (!showConcordance) {
            const concordanceNavigator = concordanceWrapper.querySelector("edirom-concordance-navigator");
            concordanceNavigator?.setCollapseState(true, { animate: false, fireLayoutChange: false });
        }
    }

    // Warn user before leaving when on the main navigator page
    if (pageName === "navigator") {
        window.addEventListener("beforeunload", handleBeforeUnload);
    } else {
        window.removeEventListener("beforeunload", handleBeforeUnload);
    }

    // Manage browser history
    if (replaceState) {
        // Used for initial page load to claim the browser's initial history entry
        window.history.replaceState({ ...appState }, "");
    } else if (pushState) {
        window.history.pushState({ ...appState }, "");
    }
    // When both are false, we're restoring from popstate - don't modify history
}

/**
 * Ensures the navigator page is visible.
 *
 * If the navigator is already active and mounted, this is a no-op by default
 * to avoid unnecessary remounts of `<edirom-navigator>`. Set `forceRemount`
 * to true when a full rebuild is explicitly required.
 *
 * @param {Object} options - History and remount options
 * @param {boolean} [options.pushState=true] - Whether to push a new history entry
 * @param {boolean} [options.replaceState=false] - Whether to replace current history entry
 * @param {boolean} [options.forceRemount=false] - Force rebuilding navigator even when already active
 * @returns {Promise<boolean>} `true` if a page switch occurred, `false` if skipped
 */
export async function showNavigator({ pushState = true, replaceState = false, forceRemount = false } = {}) {
    const navigatorElement = document.querySelector("#content-container edirom-navigator");
    const isNavigatorActive = appState.page === "navigator" && !!navigatorElement;

    if (isNavigatorActive && !forceRemount) {
        return false;
    }

    resetContentLoadingState();
    await switchPage("navigator", buildNavigator(), { pushState, replaceState });
    return true;
}

/**
 * Builds and returns the "About Edirom Mobile" page element.
 * @returns {HTMLElement} The page container element
 */
export function buildAboutEdiromMobilePage() {
    const aboutPageContainer = document.createElement("div");
    aboutPageContainer.id = "about-edirom-mobile-page";

    aboutPageContainer.innerHTML = `
        <div class="about-page-inner">

            <div class="about-hero">
                <h1>Edirom Mobile</h1>
                <p class="about-hero-subtitle">Einführung in die Nutzung der App</p>
            </div>

            <nav class="about-toc" aria-label="Inhaltsverzeichnis">
                <h2 class="about-toc-heading">Inhalt</h2>
                <ol>
                    <li><a href="#about-ch1">Willkommen bei Edirom Mobile</a></li>
                    <li><a href="#about-ch2">Edition und Werk auswählen</a></li>
                    <li><a href="#about-ch3">Der Navigator: Die Hauptansicht</a></li>
                    <li>
                        <a href="#about-ch4">Der Konkordanznavigator</a>
                        <ol>
                            <li><a href="#about-ch4-1">Ein- und Ausklappen</a></li>
                            <li><a href="#about-ch4-2">Eine Konkordanz auswählen</a></li>
                            <li><a href="#about-ch4-3">Innerhalb einer Konkordanz navigieren</a></li>
                            <li><a href="#about-ch4-4">Freies Erkunden</a></li>
                        </ol>
                    </li>
                    <li><a href="#about-ch5">Ein Dokument öffnen</a></li>
                    <li>
                        <a href="#about-ch6">Die Ansichten im Detail</a>
                        <ol>
                            <li><a href="#about-ch6-1">Die Annotationsansicht</a></li>
                            <li><a href="#about-ch6-2">Die Bildansicht (Faksimile)</a></li>
                            <li><a href="#about-ch6-3">Die Textansicht</a></li>
                        </ol>
                    </li>
                    <li><a href="#about-ch7">Ansichten sperren und entsperren</a></li>
                </ol>
            </nav>

            <section class="about-section" id="about-ch1">
                <h2>1. Willkommen bei Edirom Mobile</h2>
                <p class="about-lead">Edirom Mobile ist eine mobile Anwendung, die den direkten und intuitiven Zugang zu digitalen wissenschaftlichen Editionen ermöglicht. Sie erlaubt es, Quellen, Texte und Anmerkungen einer Edition bequem auf dem Mobilgerät zu erkunden – ohne Vorkenntnisse in digitaler Forschungsinfrastruktur.</p>
                <p>Dieses Tutorial führt Sie Schritt für Schritt durch alle wichtigen Funktionen der App. Sie können es von vorne bis hinten lesen oder gezielt einzelne Abschnitte im Inhaltsverzeichnis ansteuern. Alle Kapitel beginnen mit einem kurzen Überblick – wer es lieber ausführlicher mag, findet die Details direkt im Anschluss.</p>
                <p>Edirom Mobile ist für den Einsatz mit Editionen aus dem Bereich der Musikwissenschaft und Editionswissenschaft konzipiert. Bestimmte Fachbegriffe – wie Edition, Werk, Konkordanz oder Faksimile – werden daher vorausgesetzt oder dort kurz eingeführt, wo es ihr Gebrauch in der App erfordert.</p>
            </section>

            <section class="about-section" id="about-ch2">
                <h2>2. Edition und Werk auswählen</h2>
                <p class="about-lead">Beim ersten Start zeigt Edirom Mobile eine Übersicht aller verfügbaren Editionen. Ist nur eine Edition vorhanden, wird sie automatisch geladen. Innerhalb einer Edition können Sie das gewünschte Werk über das Auswahlmenü im oberen Bereich der App wechseln.</p>

                <h3>Die Editionsauswahl</h3>
                <p>Wenn Sie Edirom Mobile öffnen und noch keine Edition aktiv ist, erscheint automatisch die Seite <em>Edition auswählen</em>. Sie zeigt eine Liste aller Editionen, auf die die App zugreifen kann. Tippen Sie auf eine Edition, um sie zu laden.</p>
                <p>Eine Edition umfasst in der Regel mehrere Werke – etwa verschiedene Opern oder Instrumentalwerke eines Komponisten – sowie die zugehörigen Quellen, Texte und wissenschaftlichen Anmerkungen.</p>
                <p>Möchten Sie nachträglich eine andere Edition laden, öffnen Sie das Menü über das Symbol oben links (☰) und wählen Sie den Eintrag <em>Editionen</em>.</p>

                <h3>Das Werk wählen</h3>
                <p>Sobald eine Edition geladen ist, sehen Sie oben in der Kopfzeile den Titel des aktuell ausgewählten Werkes. Ein Tipp auf diesen Titel öffnet ein Auswahlmenü mit allen Werken der Edition. Wählen Sie ein anderes Werk aus, lädt die App den Navigator neu und zeigt die Materialien dieses Werkes an.</p>
            </section>

            <section class="about-section" id="about-ch3">
                <h2>3. Der Navigator: Die Hauptansicht</h2>
                <p class="about-lead">Der Navigator ist die zentrale Übersicht von Edirom Mobile. Er listet alle Dokumente und Ressourcen auf, die zum aktuell gewählten Werk gehören – zum Beispiel Quellen, Textdokumente oder externe Links. Von hier aus öffnen Sie die Inhalte, die Sie erkunden möchten.</p>
                <p>Die Einträge im Navigator sind in Gruppen gegliedert, typischerweise <em>Dokumente</em> (direkt in der App abrufbare Materialien) und <em>Externe Ressourcen</em> (Links, die im Browser geöffnet werden). Zu jedem Eintrag sehen Sie ein Symbol, das die Art des Inhalts andeutet.</p>
                <p>Beim ersten Laden erscheint kurz die Meldung <em>„Inhalte werden geladen …"</em> – die App ruft in diesem Moment die Struktur der Edition vom Server ab. Sobald die Daten vorliegen, wird die Liste aufgebaut.</p>
                <p>Ein Tipp auf einen Eintrag öffnet das zugehörige Dokument in einer der verfügbaren Ansichten. Wie das genau funktioniert, erklärt Kapitel 5.</p>
            </section>

            <section class="about-section" id="about-ch4">
                <h2>4. Der Konkordanznavigator</h2>
                <p class="about-lead">Am unteren Rand der App befindet sich der Konkordanznavigator. Er ermöglicht es, Quellen und Dokumente gezielt nach Konkordanzen zu erkunden – also nach den strukturellen Entsprechungen zwischen verschiedenen Überlieferungsträgern, etwa zwischen zwei Handschriften oder zwischen einer Handschrift und einem Druck. Der Konkordanznavigator lässt sich ein- und ausklappen und ist unabhängig davon bedienbar, welche Ansicht gerade aktiv ist.</p>

                <h3 id="about-ch4-1">4.1 Ein- und Ausklappen</h3>
                <p>Der Konkordanznavigator ist standardmäßig eingeklappt und zeigt nur einen schmalen Balken am unteren Bildschirmrand. Um ihn vollständig einzusehen, tippen Sie auf den Pfeil rechts in diesem Balken (↑) oder wischen Sie von unten nach oben über den Balken. Mit einem Tipp auf den Pfeil (↓) oder einem Wischen von oben nach unten klappen Sie ihn wieder ein.</p>

                <h3 id="about-ch4-2">4.2 Eine Konkordanz auswählen</h3>
                <p>Im Konkordanznavigator finden Sie ein Auswahlmenü, das alle in der Edition hinterlegten Konkordanzen auflistet. Eine Konkordanz bündelt dabei die Verbindungen zwischen inhaltlich zusammengehörigen Stellen in verschiedenen Quellen – zum Beispiel alle Taktstellen, die in Quelle A und Quelle B einander entsprechen.</p>
                <p>Sobald Sie eine Konkordanz auswählen, reagiert der Navigator darauf: Die angezeigte Dokumentenliste wird auf diejenigen Quellen eingeschränkt, die in dieser Konkordanz enthalten sind. So sehen Sie auf einen Blick, welche Quellen für die gewählte Konkordanz relevant sind.</p>
                <p>Falls die gewählte Konkordanz in Gruppen unterteilt ist (etwa nach Abschnitten oder Formteilen), erscheint unterhalb des Konkordanzmenüs ein weiteres Auswahlmenü für diese Gruppen.</p>

                <h3 id="about-ch4-3">4.3 Innerhalb einer Konkordanz navigieren</h3>
                <p>Ist eine Konkordanz ausgewählt, können Sie zwischen einzelnen Verbindungen navigieren. Eine Verbindung bezeichnet die konkrete Entsprechung zwischen zwei oder mehr Stellen in verschiedenen Quellen – zum Beispiel: Takt 5 in Quelle A entspricht Takt 7 in Quelle B.</p>
                <p>Für die Navigation stehen Ihnen zur Verfügung:</p>
                <ul>
                    <li><strong>Vor- und Zurück-Pfeile</strong> (← →): Springen zur vorherigen oder nächsten Verbindung.</li>
                    <li><strong>Eingabefeld</strong>: Geben Sie den Namen einer Verbindung direkt ein und bestätigen Sie mit der Eingabetaste.</li>
                    <li><strong>Schieberegler</strong>: Ermöglicht das schnelle Durchblättern aller Verbindungen per Wischen.</li>
                </ul>
                <p>Wählen Sie eine Verbindung aus, springt die App in der aktuell geöffneten Ansicht zur entsprechenden Stelle und zeigt nur den relevanten Ausschnitt. Haben Sie noch kein Dokument geöffnet, wechselt die App automatisch zum Navigator und zeigt die zu dieser Verbindung gehörigen Quellen an.</p>

                <h3 id="about-ch4-4">4.4 Freies Erkunden</h3>
                <p>Ganz oben im Konkordanzmenü steht der Eintrag <em>Freies Erkunden</em>. Wählen Sie ihn aus, werden alle durch eine Konkordanz vorgenommenen Einschränkungen aufgehoben: Der Navigator zeigt wieder alle Dokumente des Werkes, und geöffnete Ansichten kehren in den vollen, ungefilterten Modus zurück. <em>Freies Erkunden</em> ist der Ausgangszustand – ohne jede Vorgabe durch eine Konkordanz.</p>
            </section>

            <section class="about-section" id="about-ch5">
                <h2>5. Ein Dokument öffnen</h2>
                <p class="about-lead">Ein Tipp auf einen Eintrag im Navigator öffnet das zugehörige Dokument. Oberhalb des Inhalts erscheint eine Kopfzeile mit dem Dokumententitel und einem Menü zum Wechsel zwischen verschiedenen Ansichten. Welche Ansichten verfügbar sind, richtet sich nach dem Typ des Dokuments und den in der Edition hinterlegten Daten.</p>

                <h3>Der Ansichten-Header</h3>
                <p>Direkt unterhalb der App-Kopfzeile erscheint beim Öffnen eines Dokuments der Ansichten-Header. Er besteht aus zwei Bereichen:</p>
                <ul>
                    <li><strong>Ansichtenauswahl (links)</strong>: Ein Auswahlmenü mit einem Symbol zeigt die aktuell aktive Ansicht an – zum Beispiel <em>Annotationen</em>, <em>Faksimile</em> oder <em>Text</em>. Tippen Sie darauf, um zwischen den verfügbaren Ansichten zu wechseln.</li>
                    <li><strong>Dokumententitel (rechts)</strong>: Der Titel des geöffneten Dokuments, rechts ausgerichtet. Ist der Titel zu lang für den verfügbaren Platz, wird er abgekürzt angezeigt.</li>
                </ul>
                <p>Der Wechsel zwischen Ansichten erfolgt sofort – die App lädt die neue Ansicht, ohne dass Sie zur Dokumentenübersicht zurückkehren müssen.</p>
            </section>

            <section class="about-section" id="about-ch6">
                <h2>6. Die Ansichten im Detail</h2>
                <p class="about-lead">Edirom Mobile bietet derzeit drei Ansichten: die Annotationsansicht für wissenschaftliche Anmerkungen, die Bildansicht (Faksimile) für Quellenseiten und Einzeltakte sowie die Textansicht für Begleittexte der Edition. Jede Ansicht verfügt am unteren Bildschirmrand über eine eigene Leiste mit Bedienelementen.</p>

                <h3 id="about-ch6-1">6.1 Die Annotationsansicht</h3>
                <p>Die Annotationsansicht zeigt alle wissenschaftlichen Anmerkungen, die dem geöffneten Dokument zugeordnet sind. Sie ist der ideale Ausgangspunkt, um den editorischen Kommentar zu einem Werk zu lesen.</p>
                <p>Die Ansicht ist in zwei Ebenen gegliedert:</p>
                <ul>
                    <li><strong>Übersichtsliste</strong>: Alle Anmerkungen werden als Karten aufgelistet, mit Titel, Kategorie, Priorität und Quellenangabe. Ein Tipp auf eine Karte öffnet die Detailansicht.</li>
                    <li><strong>Detailansicht</strong>: Zeigt den vollständigen Annotationstext sowie zugehörige Vorschauen – etwa Quellenstellen oder Notenausschnitte. Mit dem Zurück-Pfeil des Browsers gelangen Sie wieder zur Übersichtsliste.</li>
                </ul>

                <h4>Untere Leiste</h4>
                <p>Ist die Detailansicht einer Annotation geöffnet, erscheint in der unteren Leiste eine Navigationssteuerung: Über die Vor- und Zurück-Pfeile sowie über ein Eingabefeld können Sie zwischen den Anmerkungen wechseln, ohne in die Liste zurückzukehren. Ist eine Konkordanz aktiv und die Ansicht gesperrt (→ Kapitel 7), bezieht sich die Zählung nur auf die konkordanzrelevanten Anmerkungen.</p>

                <h3 id="about-ch6-2">6.2 Die Bildansicht (Faksimile)</h3>
                <p>Die Bildansicht zeigt hochaufgelöste digitale Reproduktionen der Quellenseiten. Sie können zwischen zwei Modi wechseln: der Seitenansicht, die eine ganze Seite auf einmal darstellt, und der Taktansicht, die automatisch auf einzelne Takte heranzoomt.</p>
                <p><strong>Seitenansicht</strong>: Zeigt jeweils eine vollständige Seite des Faksimiles. Über die Bedienelemente in der unteren Leiste blättern Sie seitenweise vor und zurück oder springen direkt zu einer bestimmten Seite. Die Bildanzeige unterstützt die üblichen Touch-Gesten – Auseinanderziehen zum Zoomen, Schieben zum Verschieben des Bildausschnitts.</p>
                <p><strong>Taktansicht</strong>: Zooms automatisch auf den Bereich des aktuellen Taktes. Die Takte sind mit den Positionsdaten der MEI-Kodierung verknüpft, sodass die App präzise Ausschnitte aus dem Faksimile zeigen kann. Sie navigieren von Takt zu Takt über die Pfeile oder das Eingabefeld in der unteren Leiste.</p>

                <h4>Untere Leiste</h4>
                <p>Links in der Leiste befindet sich ein Schalter zum Wechsel zwischen Seiten- und Taktansicht – das Symbol zeigt den jeweils aktiven Modus an. Rechts daneben steuern Sie die Navigation: Das Eingabefeld mit Pfeilen (sogenannte Spin-Box) zeigt die aktuelle Seite bzw. den aktuellen Takt und erlaubt das Vor- und Zurückblättern. Der Schalter ist ausgeblendet, wenn das Dokument keine Taktinformationen enthält (zum Beispiel bei einer reinen Textquelle ohne MEI-Kodierung).</p>

                <h3 id="about-ch6-3">6.3 Die Textansicht</h3>
                <p>Die Textansicht zeigt einen der Edition zugeordneten Text – etwa einen Kritischen Bericht, eine Einleitung oder einen Kommentar. Der Text wird als formatiertes Dokument dargestellt und kann vertikal gescrollt werden.</p>
                <p>Wird aus dem Konkordanznavigator heraus eine bestimmte Textstelle angesteuert, springt die App automatisch zum entsprechenden Abschnitt. Enthält der Text Querverweise oder interne Links, lassen sich diese direkt antippen, um weitere Dokumente oder Ansichten zu öffnen.</p>

                <h4>Untere Leiste</h4>
                <p>In der Textansicht enthält die untere Leiste keine Navigationssteuerung – der Text scrollt fortlaufend. Einzig die Schloss-Schaltfläche kann hier erscheinen, falls eine Konkordanz aktiv ist (→ Kapitel 7).</p>
            </section>

            <section class="about-section" id="about-ch7">
                <h2>7. Ansichten sperren und entsperren</h2>
                <p class="about-lead">Das Schloss-Symbol in der unteren Leiste zeigt an, dass die aktuelle Ansicht auf einen durch die Konkordanz vorgegebenen Ausschnitt eingeschränkt ist. Tippen Sie darauf, um zwischen dem fokussierten (gesperrten) und dem vollständigen (entsperrten) Blick zu wechseln – ohne das Dokument schließen zu müssen.</p>

                <h3>Wann erscheint das Schloss?</h3>
                <p>Das Schloss-Symbol erscheint nur dann, wenn zwei Bedingungen gleichzeitig erfüllt sind: Eine Konkordanz ist ausgewählt, und in dem gerade geöffneten Dokument gibt es Inhalte, die einer Verbindung dieser Konkordanz entsprechen. Ist keine Konkordanz gewählt oder enthält das Dokument keinen passenden Treffer, bleibt die untere Leiste ohne Schloss-Symbol.</p>

                <h3>Gesperrt: Der fokussierte Blick</h3>
                <p>Im gesperrten Zustand (🔒) hebt ein roter Akzent in der unteren Leiste den eingeschränkten Modus hervor. Die Ansicht zeigt nur den konkordanzrelevanten Ausschnitt:</p>
                <ul>
                    <li><strong>Annotationsansicht</strong>: Nur die Anmerkungen, deren Bezug der Konkordanzverbindung entspricht, sind sichtbar und über die untere Leiste navigierbar.</li>
                    <li><strong>Bildansicht</strong>: Nur Seiten, die die betreffenden Takte enthalten, stehen zur Auswahl. Die Ansicht wechselt automatisch in die Taktansicht und zeigt den relevanten Takt.</li>
                    <li><strong>Textansicht</strong>: Das Schloss erscheint hier in der Regel nicht, da Texte keine konkordanzbasierten Teilmengen kennen.</li>
                </ul>
                <p>Der gesperrte Zustand erleichtert den direkten Vergleich zwischen Quellen: Sie sehen genau das, was die Konkordanz für dieses Dokument als relevant ausweist – ohne ablenkende Umgebung.</p>

                <h3>Entsperrt: Der volle Kontext</h3>
                <p>Tippen Sie auf das Schloss-Symbol, wechselt es in den entsperrten Zustand (🔓), und die Ansicht kehrt in den vollen Modus zurück – alle Anmerkungen, alle Seiten, alle Takte werden wieder angezeigt. Die aktuelle Position bleibt dabei erhalten: In der Bildansicht bleiben Sie auf der Seite oder beim Takt, den Sie zuletzt gesehen haben; in der Annotationsansicht bleiben Sie bei der gerade gelesenen Anmerkung.</p>
                <p>Ein erneutes Tippen auf das Schloss schließt es wieder – Sie kehren zum fokussierten Ausschnitt zurück.</p>

                <h3>Zusammenhang mit dem Konkordanznavigator</h3>
                <p>Sperren und Entsperren sind eng mit dem Konkordanznavigator verknüpft. Solange eine Konkordanz aktiv ist, können Sie jederzeit zwischen fokussiertem und vollem Blick wechseln. Wechseln Sie im Konkordanznavigator zu einer anderen Verbindung, aktualisiert sich die gesperrte Ansicht automatisch auf diese neue Verbindung. Wählen Sie <em>Freies Erkunden</em>, verschwindet das Schloss-Symbol vollständig – die Einschränkung ist dann nicht nur entsperrt, sondern gänzlich aufgehoben.</p>
            </section>

        </div>
    `;

    return aboutPageContainer;
}

/**
 * Builds and returns the edition selection page. If no editions have been loaded
 * yet, fetches them first. Renders a list of all available editions; clicking one
 * initiates the app with the selected edition.
 * @returns {Promise<HTMLElement>} The page container element
 */
export async function buildEditionSelectionPage() {

    if (!appState.allEditions || appState.allEditions.length === 0) {
        await getAllEditions();
    }


    const editionSelectionContainer = document.createElement("div");
    editionSelectionContainer.id = "edition-selection-page";

    const heading = document.createElement("h1");
    heading.textContent = "Edition auswählen";
    editionSelectionContainer.appendChild(heading);

    const editionList = document.createElement("ul");
    appState.allEditions.forEach(edition => {
        const listItem = document.createElement("li");
        const editionLink = document.createElement("span");
        editionLink.textContent = edition.name;
        editionLink.addEventListener("click", () => {
            console.log("Selected edition:", edition);
            initEdition({
                editionId: edition.id,
                backendUrl: edition.backendUrl
            });
        });
        listItem.appendChild(editionLink);
        editionList.appendChild(listItem);
    });
    editionSelectionContainer.appendChild(editionList);

    return editionSelectionContainer;
}

/**
 * Handles browser back/forward navigation.
 * 
 * Strategy:
 * 1. First, give web components a chance to handle the back request internally
 * 2. If a component handles it, use history.go(1) to cancel the navigation
 *    (using pushState would trigger Chrome's History Manipulation Intervention)
 * 3. If no component handles it, restore the appropriate page
 * 
 * @see https://chromium.googlesource.com/chromium/src/+/eef521b43a410cb55d4e5b27eec28f826484bfea
 */
window.addEventListener("popstate", async (event) => {
    // Skip popstate events triggered by our own history.go(1) calls
    if (skipNextPopstate) {
        skipNextPopstate = false;
        return;
    }

    // Fallback for null state (e.g., if replaceState wasn't called on init)
    if (!event.state) {
        await showNavigator({ replaceState: true, forceRemount: true });
        return;
    }

    if (event.state?.page) {
        // Let components handle internal back navigation first
        if (requestComponentsBackHandling()) {
            // Component handled it - navigate forward to stay on current page
            skipNextPopstate = true;
            window.history.go(1);
            return;
        }

        // No component handled it - restore the appropriate page
        if (appState.page === "navigator") {
            // Navigate back through sub-navigator stack
            if (navigateBackInNavigator()) {
                // Popped a level - stay on navigator with updated data
                return;
            }
            // Already at main navigator - block further back navigation
            skipNextPopstate = true;
            window.history.go(1);
            return;
        }

        // From views or other pages, fall back to navigator
        await showNavigator({ pushState: false });
    }
});