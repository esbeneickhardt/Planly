/**
 * Unit tests for ProjectHeader, a presentational component shared by the About/Settings/
 * Analytics pages: emoji + name, an optional owner line, a deadline pill whose wording flips
 * between "Deadline" and "Overdue" based on the date, and status pills that only appear for
 * completed/archived projects.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProjectHeader from '../../components/common/ProjectHeader';

function futureDate(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

describe('ProjectHeader', () => {
  it('renders the emoji and name', () => {
    render(<ProjectHeader emoji="🚀" name="Rocket Launch" deadline={futureDate(10)} status="active" />);
    expect(screen.getByText('🚀')).toBeInTheDocument();
    expect(screen.getByText('Rocket Launch')).toBeInTheDocument();
  });

  it('omits the owner line when no owner prop is passed', () => {
    render(<ProjectHeader name="No Owner Project" deadline={futureDate(10)} status="active" />);
    expect(screen.queryByText(/Owner:/)).not.toBeInTheDocument();
  });

  it('renders the owner line when an owner prop is passed', () => {
    render(
      <ProjectHeader
        name="Owned Project"
        deadline={futureDate(10)}
        status="active"
        owner={{ username: 'alice', realName: 'Alice Smith', avatarEmoji: '😀' }}
      />,
    );
    expect(screen.getByText(/Owner:/)).toBeInTheDocument();
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
  });

  it('shows a "Deadline ·" pill when the deadline is in the future', () => {
    render(<ProjectHeader name="Future Deadline" deadline={futureDate(10)} status="active" />);
    expect(screen.getByText(/Deadline ·/)).toBeInTheDocument();
    expect(screen.queryByText(/Overdue ·/)).not.toBeInTheDocument();
  });

  it('shows an "Overdue ·" pill when the deadline is in the past', () => {
    render(<ProjectHeader name="Past Deadline" deadline={futureDate(-10)} status="active" />);
    expect(screen.getByText(/Overdue ·/)).toBeInTheDocument();
    expect(screen.queryByText(/^Deadline ·/)).not.toBeInTheDocument();
  });

  it('shows no status pill for an active project', () => {
    render(<ProjectHeader name="Active Project" deadline={futureDate(10)} status="active" />);
    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Archived/)).not.toBeInTheDocument();
  });

  it('shows the "Completed" pill only when status is completed', () => {
    render(<ProjectHeader name="Done Project" deadline={futureDate(10)} status="completed" />);
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    expect(screen.queryByText(/Archived/)).not.toBeInTheDocument();
  });

  it('shows the "Archived" pill only when status is archived', () => {
    render(<ProjectHeader name="Old Project" deadline={futureDate(10)} status="archived" />);
    expect(screen.getByText(/Archived/)).toBeInTheDocument();
    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();
  });
});
