/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `link-groups` command */
  export type LinkGroups = ExtensionPreferences & {}
  /** Preferences accessible in the `open-link-group` command */
  export type OpenLinkGroup = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `link-groups` command */
  export type LinkGroups = {}
  /** Arguments passed to the `open-link-group` command */
  export type OpenLinkGroup = {
  /** Group ID */
  "groupId": string
}
}

