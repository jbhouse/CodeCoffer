import { Injectable } from '@angular/core';
import { Snippet } from '../models/snippet';
import { Style } from '../models/style';

@Injectable()
export class StorageService {
  private readonly SNIPPET_KEY: string = 'snippets';
  private readonly STYLE_KEY: string = 'style';
  constructor() { }

  getStyleObject(defaultStyle: Style): Style {
    if (this.contains(this.STYLE_KEY)) {
      return this.get(this.STYLE_KEY);
    }
    return this.set(this.STYLE_KEY, defaultStyle);
  }

  saveStyleObject(styleObject: Style, onSuccess: (v: boolean) => void = console.log, onRejected: (v: boolean) => void = console.log): void {
    this.set(this.STYLE_KEY, styleObject);
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(onSuccess, onRejected);
    }
  }

  getSnippets(): Snippet[] {
    if (this.contains(this.SNIPPET_KEY)) {
      return this.get(this.SNIPPET_KEY);
    }
    return this.set(this.SNIPPET_KEY, []);
  }

  addSnippet(snippet: Snippet): void {
    const snippets = this.getSnippets();
    if (!snippets.includes(snippet)) {
      snippets.unshift(snippet);
    }
    this.set(this.SNIPPET_KEY, snippets);
  }

  removeSnippet(id: string): Snippet[] {
    const snippets = this.getSnippets();
    return this.set(this.SNIPPET_KEY, snippets.filter(snippet => snippet.id !== id));
  }

  saveSnippets(snippets: Snippet[], onSuccess: (v: boolean) => void = console.log, onRejected: (v: boolean) => void = console.log): void {
    this.set(this.SNIPPET_KEY, snippets);
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(onSuccess, onRejected);
    }
  }

  private contains(key: string): boolean {
    return !!localStorage.getItem(key);
  }

  private get(key: string): any {
    return JSON.parse(localStorage.getItem(key));
  }

  private set(key: string, value: any): any {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }
}
