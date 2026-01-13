export function switchPage(pageName, newContent) {
    console.log("Switching to page:", pageName, newContent);
    const contentContainer = document.getElementById("content-container");
    contentContainer.innerHTML = ""; // Clear previous content
    contentContainer.appendChild(newContent);
}