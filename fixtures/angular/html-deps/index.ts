import { AnotherComponent } from './another-component';
import { MainComponent } from './main-component';
import { NgModule } from '@angular/core';

@NgModule({
  imports: [],
  exports: [MainComponent],
  declarations: [MainComponent, AnotherComponent],
  bootstrap: [MainComponent]
})
export class AppModule {}
