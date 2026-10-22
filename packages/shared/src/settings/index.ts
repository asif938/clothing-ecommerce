export * from "./registry.ts";
// Registers every Milestone 1 setting as a module-load side effect — import
// this module (directly or via the barrel) before reading the registry.
import "./definitions.ts";
