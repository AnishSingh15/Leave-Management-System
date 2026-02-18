import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { submitLeaveRequest, calculateLeaveDays } from '../../services/leaveService';
import { getManagers, getUserById } from '../../services/userService';
import { LeaveFormData, User } from '../../types';
import LeaveCalendar from '../Calendar/LeaveCalendar';
import './LeaveForm.css';

const LeaveForm: React.FC = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState<LeaveFormData>({
    leaveType: 'casual',
    startDate: '',
    endDate: '',
    reason: '',
    isHalfDay: false,
    managerId: '',
    useCompOff: false,
    useAnnualLeave: true
  });
  
  const [managers, setManagers] = useState<User[]>([]);
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const managerList = await getManagers();
        // Filter out current user from manager list
        setManagers(managerList.filter(m => m.uid !== userData?.uid));
      } catch (err) {
        console.error('Error fetching managers:', err);
      }
    };

    fetchManagers();
  }, [userData?.uid]);

  // Update default leave source based on balance
  useEffect(() => {
    if (userData) {
      // Default to annual leave; if unavailable, fallback to comp-off
      const hasAnnual = (userData.annualLeaveBalance || 0) > 0;
      const hasCompOff = (userData.compOffBalance || 0) > 0;
      setFormData(prev => ({
        ...prev,
        useCompOff: !hasAnnual && hasCompOff,
        useAnnualLeave: hasAnnual
      }));
    }
  }, [userData]);

  // When menstrual is selected, auto-sync endDate to startDate
  useEffect(() => {
    if (formData.leaveType === 'menstrual' && formData.startDate) {
      setFormData(prev => ({ ...prev, endDate: prev.startDate, isHalfDay: false }));
    }
  }, [formData.leaveType, formData.startDate]);

  // Calculate total days when dates change
  useEffect(() => {
    if (formData.startDate && formData.endDate) {
      const days = calculateLeaveDays(formData.startDate, formData.endDate, formData.isHalfDay);
      setTotalDays(days);
    } else {
      setTotalDays(0);
    }
  }, [formData.startDate, formData.endDate, formData.isHalfDay]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'radio') {
      // Leave source radio: only one can be selected
      if (name === 'leaveSource') {
        setFormData(prev => ({
          ...prev,
          useCompOff: value === 'compOff',
          useAnnualLeave: value === 'annualLeave'
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const validateForm = (): boolean => {
    if (!formData.startDate || !formData.endDate) {
      setError('Please select start and end dates');
      return false;
    }

    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      setError('End date must be after start date');
      return false;
    }

    if (!formData.reason.trim()) {
      setError('Please provide a reason for leave');
      return false;
    }

    if (!formData.managerId) {
      setError('Please select a manager for approval');
      return false;
    }

    // Validate leave source for leave types that deduct balance
    if (formData.leaveType !== 'wfh' && formData.leaveType !== 'extra_work') {
      if (!formData.useCompOff && !formData.useAnnualLeave) {
        setError('Please select at least one leave source');
        return false;
      }

      const availableCompOff = formData.useCompOff ? (userData?.compOffBalance || 0) : 0;
      const availableAnnual = formData.useAnnualLeave ? (userData?.annualLeaveBalance || 0) : 0;

      if (availableCompOff + availableAnnual < totalDays) {
        setError('Insufficient leave balance for selected sources');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm() || !userData) return;

    setLoading(true);

    try {
      const manager = await getUserById(formData.managerId);
      if (!manager) {
        throw new Error('Selected manager not found');
      }

      await submitLeaveRequest(formData, userData, manager);
      setSuccess('Leave request submitted successfully!');
      
      setTimeout(() => {
        navigate('/my-leaves');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };

  const isWFH = formData.leaveType === 'wfh';
  const isExtraWork = formData.leaveType === 'extra_work';
  const isMenstrual = formData.leaveType === 'menstrual';
  const isBereavement = formData.leaveType === 'bereavement';
  const noDeduction = isWFH || isExtraWork || isMenstrual || isBereavement;
  const compOffDisabled = !userData?.compOffBalance || userData.compOffBalance <= 0;
  const annualLeaveDisabled = !userData?.annualLeaveBalance || userData.annualLeaveBalance <= 0;

  const getPageTitle = () => {
    if (isExtraWork) return 'Submit Extra Day Work Request';
    if (isWFH) return 'Submit WFH Request';
    return 'Apply for Leave';
  };

  const getPageSubtitle = () => {
    if (isExtraWork) return 'Log weekend or holiday work to earn comp-off days';
    if (isWFH) return 'Submit your work from home request';
    return 'Fill in the details below to submit your leave request';
  };

  const getButtonText = () => {
    if (loading) return 'Submitting...';
    if (isExtraWork) return 'Submit Extra Day Work Request';
    if (isWFH) return 'Submit WFH Request';
    return 'Submit Leave Request';
  };

  return (
    <div className="leave-form-container">
      <div className="page-header">
        <h1>{getPageTitle()}</h1>
        <p>{getPageSubtitle()}</p>
      </div>

      <div className="card">
        <div className="leave-form-calendar">
          <LeaveCalendar compact />
        </div>

        <div className="balance-summary">
          <div className="balance-item">
            <span className="balance-label">Annual Leave:</span>
            <span className="balance-value">{userData?.annualLeaveBalance || 0} / 20 days</span>
          </div>
          <div className="balance-item">
            <span className="balance-label">Comp Off:</span>
            <span className="balance-value">{userData?.compOffBalance || 0} days</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="leaveType">Leave Type *</label>
              <select
                id="leaveType"
                name="leaveType"
                value={formData.leaveType}
                onChange={handleChange}
                required
              >
                <option value="casual">Casual Leave</option>
                <option value="paid">Paid Leave</option>
                <option value="sick">Sick Leave</option>
                <option value="comp_off">Comp Off Usage</option>
                <option value="wfh">Work From Home</option>
                <option value="extra_work">Extra Day Work — Weekend / Holiday (Earn Comp Off)</option>
                <option value="menstrual">Menstrual Leave (Monthly 1 day)</option>
                <option value="bereavement">Bereavement Leave (Yearly)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="managerId">Approving Manager *</label>
              <select
                id="managerId"
                name="managerId"
                value={formData.managerId}
                onChange={handleChange}
                required
              >
                <option value="">Select Manager</option>
                {managers.map(manager => (
                  <option key={manager.uid} value={manager.uid}>
                    {manager.name} ({manager.role.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startDate">{isMenstrual ? 'Date *' : 'Start Date *'}</label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                min={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            {!isMenstrual && (
              <div className="form-group">
                <label htmlFor="endDate">End Date *</label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  min={formData.startDate || new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Total Days</label>
              <div className="total-days-display">
                {isMenstrual ? '1 day' : `${totalDays} ${totalDays === 1 ? 'day' : 'days'}${formData.isHalfDay ? ' (Half Day)' : ''}`}
              </div>
            </div>

            {!isMenstrual && (
              <div className="form-group checkbox-inline">
                <input
                  type="checkbox"
                  id="isHalfDay"
                  name="isHalfDay"
                  checked={formData.isHalfDay}
                  onChange={handleChange}
                />
                <label htmlFor="isHalfDay">Half Day</label>
              </div>
            )}
          </div>

          {!noDeduction && (
            <div className="form-group">
              <label>Leave Source *</label>
              <p className="help-text">Select which balance to deduct from</p>
              <div className="checkbox-group">
                <div className={`checkbox-item ${compOffDisabled ? 'disabled' : ''}`}>
                  <input
                    type="radio"
                    id="useCompOff"
                    name="leaveSource"
                    value="compOff"
                    checked={formData.useCompOff}
                    onChange={handleChange}
                    disabled={compOffDisabled}
                  />
                  <label htmlFor="useCompOff">
                    Comp Off ({userData?.compOffBalance || 0} available)
                  </label>
                </div>

                <div className={`checkbox-item ${annualLeaveDisabled ? 'disabled' : ''}`}>
                  <input
                    type="radio"
                    id="useAnnualLeave"
                    name="leaveSource"
                    value="annualLeave"
                    checked={formData.useAnnualLeave}
                    onChange={handleChange}
                    disabled={annualLeaveDisabled}
                  />
                  <label htmlFor="useAnnualLeave">
                    Annual Leave ({userData?.annualLeaveBalance || 0} available)
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="reason">Reason *</label>
            <textarea
              id="reason"
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              placeholder="Provide a reason for your leave request"
              rows={4}
              required
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/dashboard')}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {getButtonText()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeaveForm;
