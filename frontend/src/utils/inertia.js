/**
 * Resolve Inertia page components from the pages directory.
 */
export function resolvePageComponent(name, pages) {
    const path = `./pages/${name}.jsx`
    const page = pages[path]
    if (!page) {
        throw new Error(`Page not found: ${name}. Available: ${Object.keys(pages).join(', ')}`)
    }
    return typeof page === 'function' ? page() : page
}
