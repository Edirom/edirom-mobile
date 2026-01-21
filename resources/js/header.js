import { switchPage, buildAboutEdiromMobilePage } from "./pages.js";

function setupEditionNameTooltip() {
    const editionNameEl = document.getElementById("header-edition-name");
    const headerEl = document.querySelector("header");

    if (!editionNameEl || !headerEl) {
        return;
    }

    let tooltipEl = document.getElementById("header-edition-tooltip");

    if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.id = "header-edition-tooltip";
        tooltipEl.setAttribute("role", "status");
        document.body.appendChild(tooltipEl);
    }

    const hideTooltip = () => {
        tooltipEl.classList.remove("visible");
    };

    const positionTooltip = () => {
        const headerRect = headerEl.getBoundingClientRect();
        const top = headerRect.bottom + window.scrollY + 6;
        tooltipEl.style.top = `${top}px`;
    };

    const showTooltip = () => {
        tooltipEl.textContent = editionNameEl.textContent || "";
        positionTooltip();
        tooltipEl.classList.add("visible");
    };

    editionNameEl.addEventListener("click", () => {
        if (tooltipEl.classList.contains("visible")) {
            hideTooltip();
        } else {
            showTooltip();
        }
    });

    document.addEventListener("click", (event) => {
        if (editionNameEl.contains(event.target) || tooltipEl.contains(event.target)) {
            return;
        }

        hideTooltip();
    });

    window.addEventListener("resize", hideTooltip);
    window.addEventListener("orientationchange", hideTooltip);
}

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
    // setupEditionNameTooltip();
}

export function setWorkTitle(workData) {
    let title = workData.title;
    document.getElementById("header-edition-name").textContent = title;
    document.title = title;

}