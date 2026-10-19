import { switchPage, buildAboutEdiromMobilePage, buildEditionSelectionPage, allowNextUnload } from "./pages.js";
import { appState } from "./config.js";
import { initWork } from "./main.js";

const HEADER_MENU_URLS = [
    { label: "Korngold Werkausgabe", href: "https://korngold-werkausgabe.de" }
];

/**
 * Builds the header navigation menu as a `<ul>` element containing links for
 * edition selection, settings, the about page, and any external URLs defined
 * in `HEADER_MENU_URLS`.
 * @returns {HTMLUListElement} The populated menu list element
 */
function buildHeaderMenu() {
    const listEl = document.createElement("ul");

    const editionsLi = document.createElement("li");
    const editionsLink = document.createElement("a");
    const editionsIcon = document.createElement("edirom-icon");
    editionsIcon.setAttribute("name", "newsstand");
    editionsLink.appendChild(editionsIcon);
    editionsLink.appendChild(document.createTextNode("Editionen"));
    editionsLink.setAttribute("role", "button");
    editionsLink.setAttribute("tabindex", "0");
    editionsLink.addEventListener("click", (event) => {
        switchPage("edition-selection", buildEditionSelectionPage());
    });
    editionsLi.appendChild(editionsLink);
    listEl.appendChild(editionsLi);

    const settingsLi = document.createElement("li");
    const settingsLink = document.createElement("a");
    const settingsIcon = document.createElement("edirom-icon");
    settingsIcon.setAttribute("name", "settings");
    settingsLink.appendChild(settingsIcon);
    settingsLink.appendChild(document.createTextNode("Einstellungen"));
    settingsLink.setAttribute("role", "button");
    settingsLink.setAttribute("tabindex", "0");
    settingsLink.addEventListener("click", (event) => {
        switchPage("settings", buildSettingsPage());
    });
    settingsLi.appendChild(settingsLink);
    listEl.appendChild(settingsLi);

    const aboutLi = document.createElement("li");
    const aboutLink = document.createElement("a");
    const aboutIcon = document.createElement("edirom-icon");
    aboutIcon.setAttribute("name", "info");
    aboutLink.appendChild(aboutIcon);
    aboutLink.appendChild(document.createTextNode("Über Edirom Mobile"));
    aboutLink.setAttribute("role", "button");
    aboutLink.setAttribute("tabindex", "0");
    aboutLink.addEventListener("click", (event) => {
        switchPage("about-edirom-mobile", buildAboutEdiromMobilePage());
    });
    aboutLi.appendChild(aboutLink);
    listEl.appendChild(aboutLi);

    HEADER_MENU_URLS.forEach(({ label, href }) => {
        const listItem = document.createElement("li");
        const link = document.createElement("a");
        const linkIcon = document.createElement("edirom-icon");
        linkIcon.setAttribute("name", "open_in_new");
        link.appendChild(linkIcon);
        link.appendChild(document.createTextNode(label));
        link.setAttribute("href", href);
        link.setAttribute("target", "_blank");
        listItem.appendChild(link);
        listEl.appendChild(listItem);
    });

    const switchToDesktopLi = document.createElement("li");
    const switchToDesktopLink = document.createElement("a");
    const switchToDesktopIcon = document.createElement("edirom-icon");
    switchToDesktopIcon.setAttribute("name", "devices");
    switchToDesktopLink.appendChild(switchToDesktopIcon);
    switchToDesktopLink.appendChild(document.createTextNode("Zur Desktop-Ansicht"));
    switchToDesktopLink.setAttribute("role", "button");
    switchToDesktopLink.setAttribute("tabindex", "0");
    switchToDesktopLink.addEventListener("click", (event) => {
        const params = new URLSearchParams();
        params.set("ui", "desktop");
        if (appState.edition?.id) params.set("edition", appState.edition.id);
        if (appState.work?.id) params.set("work", appState.work.id);

        // Deliberate exit: skip the "Leave site?" dialog for this navigation only
        allowNextUnload();
        window.location.href = "../index.html?" + params.toString();
    });
    switchToDesktopLi.appendChild(switchToDesktopLink);
    listEl.appendChild(switchToDesktopLi);

    return listEl;
}

/**
 * Initializes the burger menu in the page header. Populates the menu with
 * navigation links and wires up all toggle, close-on-outside-click, and
 * close-on-resize event listeners.
 * Does nothing if the burger or menu element is missing from the DOM.
 */
export function setupHeaderMenu() {
    const burger = document.getElementById("header-burger-menu");
    const menu = document.getElementById("header-menu");

    if (!burger || !menu) {
        return;
    }

    menu.innerHTML = "";
    const listEl = buildHeaderMenu();
    menu.appendChild(listEl);

    burger.setAttribute("role", "button");
    burger.setAttribute("aria-controls", "header-menu");
    burger.setAttribute("aria-expanded", "false");

    const closeMenu = () => {
        if (!menu.classList.contains("open")) {
            return;
        }

        menu.classList.remove("open");
        menu.setAttribute("aria-hidden", "true");
        burger.setAttribute("aria-expanded", "false");
    };

    const openMenu = () => {
        menu.classList.add("open");
        menu.setAttribute("aria-hidden", "false");
        burger.setAttribute("aria-expanded", "true");
    };

    burger.addEventListener("click", (event) => {
        event.stopPropagation();
        if (menu.classList.contains("open")) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    document.addEventListener("click", (event) => {
        if (menu.contains(event.target) || burger.contains(event.target)) {
            return;
        }

        closeMenu();
    });

    menu.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest("a") : null;
        if (target) {
            closeMenu();
        }
    });

    window.addEventListener("resize", closeMenu);
    window.addEventListener("orientationchange", closeMenu);
}

/**
 * Renders or updates the work selector in the header. Creates a `<select>` element
 * inside `#header-edition-name` if it does not yet exist, then populates it with
 * one option per work in the current edition. The currently active work is pre-selected.
 * Also updates `document.title` to the active work's title.
 */
export function setWorkTitle() {
    let container = document.getElementById("header-edition-name");

    if (!container) return;

    let wrapper = container.querySelector(".work-selector-wrapper");
    let select;

    if (!wrapper) {
        container.innerHTML = "";

        wrapper = document.createElement("div");
        wrapper.className = "work-selector-wrapper";

        select = document.createElement("select");
        select.id = "work-selector";

        select.addEventListener("change", (e) => {
            const workId = e.target.value;
            const work = appState.worksInEdition.find((w) => w.id === workId);
            if (!work) {
                return;
            }
            initWork(work.id);
        });

        wrapper.appendChild(select);
        container.appendChild(wrapper);
    } else {
        select = wrapper.querySelector("select");
    }

    // Populate or update options
    select.innerHTML = "";
    appState.worksInEdition.forEach(work => {
        const option = document.createElement("option");
        option.value = work.id;
        option.textContent = work.title;
        if (work.id === appState.work.id) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    document.title = appState.work.title;
}