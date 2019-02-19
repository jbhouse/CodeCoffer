import { Injectable } from '@angular/core';
import { Snippet } from '../models/snippet';
import { SearchParameters } from '../models/searchParameters';
import { StorageService } from './storage.service';
import { Observable, BehaviorSubject } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { ToastService } from './toast.service';
import { Toast } from '../models/toast.enum';
import { HotKeyService } from './hot-key.service';
import { HotKey } from '../models/hot-key.enum';

@Injectable()
export class SnippetService {
  private snippets: Snippet[];
  private deletedSnippets: Snippet[];
  private snippetsSubject: BehaviorSubject<Snippet[]>;
  private pinnedSnippetsSubject: BehaviorSubject<Snippet[]>;
  private searchSubject: BehaviorSubject<SearchParameters>;
  private timerId: any;
  private readonly SAVE_INTERVAL = 200000;
  private readonly DEFAULT_PAGE_SIZE = 12;

  constructor(private hotKeyService: HotKeyService, private storage: StorageService, private toastService: ToastService) {
    this.snippets = this.storage.getSnippets();
    this.deletedSnippets = [];
    this.sortSnippets();
    this.snippetsSubject = new BehaviorSubject<Snippet[]>(this.sliceSnippets());
    this.pinnedSnippetsSubject = new BehaviorSubject<Snippet[]>(this.determinePinnedSnippets());
    this.searchSubject = new BehaviorSubject<SearchParameters>(new SearchParameters());
    this.timerId = setInterval(() => this.saveSnippets(), this.SAVE_INTERVAL);
    this.hotKeyService.pull().pipe(
      filter(hotKey => hotKey === HotKey.UNDO),
      map(undoCommand => this.undoDelete()),
      filter(Boolean)
    ).subscribe(success => this.toastService.push(Toast.SNIPPET_RESTORED));
  }
  getSearchParameters(): Observable<SearchParameters> {
    return this.searchSubject.asObservable().pipe(distinctUntilChanged());
  }

  getPinnedSnippets(): Observable<Snippet[]> {
    return this.pinnedSnippetsSubject.asObservable();
  }

  /**
   * Snippet titles change, so this method can make sure everything is up to date.
   */
  refreshPinnedSnippets(): void {
    this.pinnedSnippetsSubject.next(this.determinePinnedSnippets());
  }

  pinSnippet(id: string): void {
    this.getSnippetById(id).pinned = true;
    this.refreshPinnedSnippets();
  }

  unpinSnippet(id: string): void {
    this.getSnippetById(id).pinned = false;
    this.refreshPinnedSnippets();
  }

  onPinnedSnippetSelected(id: string): void {
    window.scrollTo(0, 0);
    const selectedSnippet: Snippet = this.getSnippetById(id);
    selectedSnippet.showing = true;
    const visibleSnippets: Snippet[] = this.snippetsSubject.value.filter(snippet => snippet.id !== id);
    visibleSnippets.unshift(selectedSnippet);
    this.snippetsSubject.next(visibleSnippets);
  }

  /**
   * To get the currently visible snippets, subscribe to this.
   */
  getSnippetList(): Observable<Snippet[]> {
    return this.snippetsSubject.asObservable();
  }

  /**
   * To get all snippets, invoke this method.
   */
  getAllSnippets(): Snippet[] {
    return this.snippets;
  }

  loadRemainingSnippets(): void {
    this.snippetsSubject.next(this.snippets);
  }

  getSnippetById(snippetId: string): Snippet {
    return this.snippets.find(snippet => snippet.id === snippetId);
  }

  addSnippet(snippet: Snippet): void {
    snippet.id = this.createId();
    this.storage.addSnippet(snippet);
    this.snippets.unshift(snippet);
    window.scrollTo(0, 0);
    const snippetsToDisplay = this.snippetsSubject.value;
    snippetsToDisplay.unshift(snippet);
    this.snippetsSubject.next(snippetsToDisplay);
    this.toastService.push(Toast.SNIPPET_ADDED);
    this.refreshPinnedSnippets();
  }

  deleteSnippet(snippetId: string): void {
    this.deletedSnippets.unshift(...(this.snippets.filter(snippet => snippet.id === snippetId)));
    this.storage.removeSnippet(snippetId);
    this.snippets = this.snippets.filter(snippet => snippet.id !== snippetId);
    this.snippetsSubject.next(this.sliceSnippets());
    this.toastService.push(Toast.SNIPPET_DELETED);
    this.refreshPinnedSnippets();
  }

  search(searchParams: SearchParameters, saveSearch: boolean = true) {
    if (saveSearch) {
      this.searchSubject.next(searchParams);
    }
    const query = searchParams.query.trim();
    const searchResultsMap: Map<Snippet, number> = new Map<Snippet, number>();
    const terms: string[] = query.toLocaleUpperCase().split(',').map(str => str.trim());
    terms.filter(term => term.length).forEach(term =>
      this.snippets.forEach(snippet => {
        let score = searchResultsMap.has(snippet) ? searchResultsMap.get(snippet) : 0;
        if (searchParams.title && snippet.title.toLocaleUpperCase().includes(term)) {
          score++;
        } if (searchParams.tags && this.isInTags(term, snippet)) {
          score++;
        } if (searchParams.code && this.isInCode(term, snippet)) {
          score++;
        } if (searchParams.notes && this.isInNotes(term, snippet)) {
          score++;
        }
        searchResultsMap.set(snippet, score);
      }));

    this.snippets.forEach(snippet => {
      const hasPositiveSearchScore = searchResultsMap.has(snippet) && searchResultsMap.get(snippet) > 0;
      snippet.showing = hasPositiveSearchScore || query.length === 0;
    })
    if (query.length > 0) {
      this.snippets.sort((a, b) => a.showing && b.showing ?
        searchResultsMap.get(b) - searchResultsMap.get(a)
        : +b.showing - +a.showing);
    } else {
      this.sortSnippets();
    }
    this.snippetsSubject.next(this.sliceSnippets());
    this.toastService.push(Toast.SEARCH_COMPLETED);
  }

  private sortSnippets(): void {
    this.snippets.sort((a, b) => this.compareSnippets(a, b));
    // this.snippets.sort((a, b) => a.showing && b.showing ? this.compareIndices( a, b) : this.compareShowing(a, b));
  }

  private compareSnippets(a: Snippet, b:Snippet): number {
    let result = this.compareShowing(a, b);
    if(result === 0) {
      result = this.compareIndices(a, b);
    }
    if(result === 0) {
      result = this.compareTimestamps(a, b);
    }
    if(result === 0) {
      result = this.compareTitles(a, b);
    }
    return result;
  }

/**
   * The alphabetically lowest Snippet title comes first (title "a" comes before title "b")
   * @param a 
   * @param b 
   */
  private compareTitles(a: Snippet, b: Snippet): number {
    if(a.title > b.title) {
      return 1;
    }
    else if(b.title > a.title) {
      return -1;
    }
    return 0;
  }

  /**
   * The alphabetically lowest Snippet index comes first (index "1" comes before index "2")
   * @param a 
   * @param b 
   */
  private compareIndices(a: Snippet, b: Snippet): number {
    if(a.index > b.index) {
      return 1;
    }
    else if(b.index > a.index) {
      return -1;
    }
    return 0;
  }

  /**
   * Snippets that are showing come first (showing "true" comes before showing "false" (showing is not really a string))
   * @param a 
   * @param b 
   */
  private compareShowing(a: Snippet, b: Snippet): number {
    return +b.showing - +a.showing;
  }
  
  /**
   * Snippets that are newer come first (timestamp "today" comes before timestamp "yesterday" (timestamps aren't really strings))
   */
  private compareTimestamps(a: Snippet, b: Snippet): number {
    return b.timestamp - a.timestamp;
  }

  saveSnippets(): void {
    this.storage.saveSnippets(this.snippets, () => this.toastService.push(Toast.SAVE_SUCCEEDED),
      () => this.toastService.push(Toast.SAVE_FAILED));
  }

  import(imported: Snippet | Array<Snippet>): void {
    const importedSnippetArray: Snippet[] = imported instanceof Array ? imported : [imported];
    importedSnippetArray.sort((snippetA, snippetB) => snippetB.timestamp - snippetA.timestamp);
    importedSnippetArray.forEach((snippet, index) => {
      snippet.id = this.createId();
      snippet.showing = true;
      snippet.timestamp = Date.now() + (importedSnippetArray.length - index);
    });
    this.snippets.unshift(...importedSnippetArray);
    this.saveSnippets();
    this.snippetsSubject.next(this.sliceSnippets());
    this.refreshPinnedSnippets();
    this.toastService.push(Toast.IMPORT_SUCCEEDED);
  }

  clear(): void {
    clearInterval(this.timerId);
  }

  hasMoreSnippets(index: number): boolean {
    return this.snippets.filter(snippet => snippet.showing).length > index;
  }

  undoDelete(): boolean {
    if (this.deletedSnippets.length > 0) {
      this.addSnippet(this.deletedSnippets.shift());
      return true;
    }
    return false;
  }

  canImport(snippetId: string): Observable<boolean> {
    return null;
  }

  private getTags(tags: string): Array<string> {
    return tags.split(',').map(s => s.trim());
  }

  private sliceSnippets(): Snippet[] {
    return this.snippets.slice(0, this.DEFAULT_PAGE_SIZE).filter(snippet => snippet.showing);
  }

  private createId(): string {
    return String(Math.floor(Math.random() * 1000000000) + 1);
  }

  private determinePinnedSnippets(): Snippet[] {
    return this.snippets.filter(snippet => snippet.pinned)
  }

  private isInCode(term: string, snippet: Snippet): boolean {
    return snippet.code.toLocaleUpperCase().includes(term) || snippet.supplements.map(supplement => supplement.code.toLocaleUpperCase())
      .some(code => code.includes(term));
  }

  private isInNotes(term: string, snippet: Snippet): boolean {
    return snippet.notes.toLocaleUpperCase().includes(term) || snippet.supplements.map(supplement => supplement.notes.toLocaleUpperCase())
      .some(notes => notes.includes(term));
  }

  private isInTags(term: string, snippet: Snippet): boolean {
    return this.getTags(snippet.tags.toLocaleUpperCase()).some(tag => tag === term);
  }
}
