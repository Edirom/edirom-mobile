import { switchPage, buildAboutEdiromMobilePage } from "./pages.js";
import { appState } from "./config.js";
import { initWork } from "./main.js";

const HEADER_MENU_ITEMS = [
    { label: "Über Edirom Mobile", id: "about-edirom-mobile" },
    { label: "Einstellungen", href: "https://korngold-werkausgabe.de" },
    { label: "Sammlung", href: "https://korngold-werkausgabe.de" },
    { label: "Werkzeuge", href: "https://korngold-werkausgabe.de" },
    { label: "Kontakt", href: "https://korngold-werkausgabe.de" },
];

function buildHeaderMenu() {
    const listEl = document.createElement("ul");

    HEADER_MENU_ITEMS.forEach(({ label, href, id = null }) => {
        const listItem = document.createElement("li");
        const link = document.createElement("a");

        if (id === "about-edirom-mobile") {
            link.addEventListener("click", (event) => {
                switchPage("about-edirom-mobile", buildAboutEdiromMobilePage());
            });
        }

        link.textContent = label;

        if (href) {
            link.setAttribute("href", href);
            link.setAttribute("target", "_blank");
        } else {
            link.setAttribute("role", "button");
            link.setAttribute("tabindex", "0");
        }

        listItem.appendChild(link);
        listEl.appendChild(listItem);
    });

    return listEl;
}

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
            initWork({ workId: work.id });
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