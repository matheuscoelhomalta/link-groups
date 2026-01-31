export type LinkItem = {
  id: string;
  title: string;
  url: string;
};

/** Supported browsers - empty string means system default */
export type Browser =
  | ""
  | "com.apple.Safari"
  | "com.google.Chrome"
  | "com.vivaldi.Vivaldi"
  | "com.brave.Browser"
  | "org.mozilla.firefox"
  | "company.thebrowser.Browser"
  | "com.microsoft.edgemac";

export const BROWSER_OPTIONS: { value: Browser; title: string }[] = [
  { value: "", title: "System Default" },
  { value: "com.apple.Safari", title: "Safari" },
  { value: "com.google.Chrome", title: "Google Chrome" },
  { value: "com.vivaldi.Vivaldi", title: "Vivaldi" },
  { value: "com.brave.Browser", title: "Brave" },
  { value: "org.mozilla.firefox", title: "Firefox" },
  { value: "company.thebrowser.Browser", title: "Arc" },
  { value: "com.microsoft.edgemac", title: "Microsoft Edge" },
];

export function getBrowserLabel(bundleId?: Browser): string {
  if (!bundleId) return "System Default";
  return (
    BROWSER_OPTIONS.find((option) => option.value === bundleId)?.title ??
    "System Default"
  );
}

export type LinkGroup = {
  id: string;
  title: string;
  links: LinkItem[];
  browser?: Browser;
};

export type LinkDB = {
  version: 1;
  groups: LinkGroup[];
};
