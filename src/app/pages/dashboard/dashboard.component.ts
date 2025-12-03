import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  isLoading = false;
  stats = {
    totalUsers: 1234,
    activeProjects: 45,
    revenue: 98765,
    growth: 12.5
  };

  recentActivities = [
    { id: 1, action: 'New user registered', time: '5 minutes ago' },
    { id: 2, action: 'Project updated', time: '15 minutes ago' },
    { id: 3, action: 'Report generated', time: '1 hour ago' },
    { id: 4, action: 'Data synced', time: '2 hours ago' }
  ];

  ngOnInit(): void {
    console.log('Dashboard component initialized');
  }

  onFiltersChanged(filters: any): void {
    console.log('Filters changed:', filters);
    // Handle filter changes here
    // You can update your data, make API calls, etc.
  }
}

