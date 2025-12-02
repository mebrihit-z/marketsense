import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent {
  teamMembers = [
    {
      name: 'John Doe',
      role: 'CEO & Founder',
      bio: 'Visionary leader with 15+ years of market analysis experience.'
    },
    {
      name: 'Jane Smith',
      role: 'CTO',
      bio: 'Tech expert specializing in data analytics and AI.'
    },
    {
      name: 'Mike Johnson',
      role: 'Head of Research',
      bio: 'Market research specialist with deep industry knowledge.'
    }
  ];
}

