/** The inert `<script type="application/json">` of the built index.html that holds the files to prefetch. */
export const PREFETCH_LIST_ID = "prefetch-chunks";

/** What the list needs of a file of the Rollup bundle. */
export type BuiltFile = {
    type: "chunk" | "asset";
    fileName: string;
    isEntry?: boolean;
    imports?: string[];
    viteMetadata?: { importedCss: Set<string> };
};

/**
 * Every JS and CSS file of the build except those index.html already loads (the entries, their static imports and
 * their CSS), as URLs. It comes from the bundle, so a new lazy page is on it without anyone adding it.
 */
export const prefetchUrls = (bundle: Record<string, BuiltFile>, base: string): string[] => {
    const loadedAtStart = new Set<string>();
    const addWithImports = (fileName: string) => {
        if (loadedAtStart.has(fileName)) return;
        loadedAtStart.add(fileName);
        const file = bundle[fileName];
        file?.viteMetadata?.importedCss.forEach(css => loadedAtStart.add(css));
        file?.imports?.forEach(addWithImports);
    };
    Object.values(bundle).filter(file => file.isEntry).forEach(file => addWithImports(file.fileName));
    return Object.keys(bundle)
        .filter(fileName => /\.(js|css)$/.test(fileName) && !loadedAtStart.has(fileName))
        .sort()
        .map(fileName => base + fileName);
};
