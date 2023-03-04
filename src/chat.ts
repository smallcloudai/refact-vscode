/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { marked } from 'marked'; // Markdown parser documentation: https://marked.js.org/
import { ChatTab } from './chatTab';

const html = marked.parse('# Marked in Node.js\n\nRendered by **marked**.');