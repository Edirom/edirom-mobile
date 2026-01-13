const DEFAULT_EDITION_URI = "xmldb:exist:///db/apps/edirom/edition-example/content/ediromEditions/edirom_edition_example.xml"; // TODO: This should not be hardcoded
const DEFAULT_LANGUAGE = "de";
const DEFAULT_AVAILABLE_VIEWS = ["annotationView"];
const DEFAULT_VIEW_HEADER_ID = "view-header";

export const appConfig = {
    backendUrl: window?.config?.APP_BACKEND_URL ?? "",
    viewHeaderId: DEFAULT_VIEW_HEADER_ID,
    availableViews: [...DEFAULT_AVAILABLE_VIEWS],
};

export const appState = {
    editionUri: DEFAULT_EDITION_URI,
    language: DEFAULT_LANGUAGE,
};
