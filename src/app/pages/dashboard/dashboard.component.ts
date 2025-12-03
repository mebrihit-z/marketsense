import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FiltersBarComponent } from '../../shared/components/filters/filters-bar/filters-bar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FiltersBarComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
 
  

  ngOnInit(): void {
    console.log('Dashboard component initialized');
  }

}

