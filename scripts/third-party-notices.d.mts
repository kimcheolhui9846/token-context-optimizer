import type { BuildOptions, Metafile } from "esbuild";

export interface LicenseFileText {
  file: string;
  text: string;
}

export interface BundledPackage {
  name: string;
  version: string;
  license: string | null;
  dir: string;
  licenseFiles: LicenseFileText[];
  extraNotices: { heading: string; text: string }[];
}

export interface VendoredComponent {
  name: string;
  version: string;
  license: string;
  licenseFile: string;
  text: string;
  via: string[];
}

export interface ThirdPartyComponents {
  packages: BundledPackage[];
  vendored: VendoredComponent[];
}

export declare const bundleBuildOptions: Readonly<BuildOptions>;
export declare function packageNameFromInput(input: string): string | null;
export declare function parseVendoredMarkers(source: string): { name: string; version: string }[];
export declare function collectThirdPartyComponents(options: { metafile: Metafile; rootDir: string }): Promise<ThirdPartyComponents>;
export declare function renderThirdPartyNotices(components: ThirdPartyComponents): string;
