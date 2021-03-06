import { Component, OnInit, OnDestroy } from '@angular/core';
import { StyleService } from '../../services/style.service';
import { ToastService } from '../../services/toast.service';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { RoutingService } from '../../services/routing.service';

@Component({
  selector: 'app-style-editor',
  templateUrl: './style-editor.component.html',
  styleUrls: ['./style-editor.component.css']
})
export class StyleEditorComponent implements OnInit, OnDestroy {

  style: string;
  subscriptions: Subscription[] = [];

  constructor(private routingService: RoutingService, private styleService: StyleService, private toastService: ToastService) { }

  ngOnInit() {
    this.subscriptions.push(this.styleService.getStyleObject()
      .pipe(
        map(styleObject => JSON.stringify(styleObject, null, 2))
      )
      .subscribe(previousStyle => this.style = previousStyle));
  }

  ngOnDestroy() {
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
  }

  back(): void {
    this.routingService.goHome();
  }

  save(): void {
    this.styleService.saveStyleObject(JSON.parse(this.style));
  }

  revert(): void {
    this.style = JSON.stringify(this.styleService.revert(), null, 2);
    this.save();
  }
}
