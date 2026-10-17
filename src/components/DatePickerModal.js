import React, { useState, useEffect, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { C, themed } from '../utils/theme';

const SCREEN_W = Dimensions.get('window').width;

// ── Date Picker Modal ─────────────────────────────────────────────────────────

const DatePickerModal = memo(({ visible, title, selectedDate, onSelect, onClose }) => {
  const today = new Date();
  const initDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;
  const [viewYear,  setViewYear]  = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  useEffect(() => {
    if (visible) {
      const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible]);

  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow     = new Date(viewYear, viewMonth, 1).getDay();
  const monthLabel   = new Date(viewYear, viewMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const isSelected = (day) => {
    if (!day || !selectedDate) return false;
    const sel = new Date(selectedDate + 'T00:00:00');
    return sel.getFullYear() === viewYear && sel.getMonth() === viewMonth && sel.getDate() === day;
  };

  const handleDay = (day) => {
    if (!day) return;
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onSelect(`${viewYear}-${mm}-${dd}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dp.overlay}>
        <View style={dp.box}>
          <Text style={dp.title}>{title}</Text>
          <View style={dp.navRow}>
            <TouchableOpacity onPress={prevMonth} style={dp.navBtn}>
              <Text style={dp.arrow}>‹</Text>
            </TouchableOpacity>
            <Text style={dp.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity onPress={nextMonth} style={dp.navBtn}>
              <Text style={dp.arrow}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={dp.weekRow}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <Text key={i} style={dp.weekDay}>{d}</Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={dp.row}>
              {row.map((day, ci) => (
                <TouchableOpacity
                  key={ci}
                  style={[dp.cell, isSelected(day) && dp.cellSel]}
                  onPress={() => handleDay(day)}
                  disabled={!day}
                  activeOpacity={0.7}
                >
                  {day ? (
                    <Text style={[dp.cellText, isSelected(day) && dp.cellTextSel]}>{day}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <TouchableOpacity style={dp.cancelBtn} onPress={onClose}>
            <Text style={dp.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const dp = themed(() => StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: C.scrimLight, justifyContent: 'center', alignItems: 'center' },
  box:         { backgroundColor: C.elevated, borderRadius: 16, padding: 20, width: SCREEN_W - 48 },
  title:       { fontSize: 16, fontWeight: '700', color: C.textPrimary, textAlign: 'center', marginBottom: 12 },
  navRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  navBtn:      { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  arrow:       { fontSize: 24, color: C.brand, fontWeight: '700' },
  monthLabel:  { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600', color: C.textPrimary },
  weekRow:     { flexDirection: 'row', marginBottom: 4 },
  weekDay:     { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: C.textMuted },
  row:         { flexDirection: 'row' },
  cell:        { flex: 1, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8, margin: 1 },
  cellSel:     { backgroundColor: C.brand },
  cellText:    { fontSize: 14, color: C.textPrimary },
  cellTextSel: { color: C.onBrand, fontWeight: '700' },
  cancelBtn:   { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  cancelText:  { color: C.textSecond, fontSize: 14 },
}));

export default DatePickerModal;
