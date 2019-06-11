import { NgModule, Component } from '@angular/core';

const styleUrl = './my-style2.css';

@Component({
  selector: 'main-component',
  templateUrl: './my-template.html',
  styleUrls: ['./my-style1.css', styleUrl]
})
export class MainComponent {}

@NgModule({
  imports: [],
  exports: [MainComponent],
  declarations: [MainComponent],
  bootstrap: [MainComponent]
})
export class AppModule {}
