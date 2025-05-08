import { useState, useEffect } from 'react';
import { Button, MenuItem, Select, InputLabel, FormControl, Typography, Paper, Box, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import jsPDF from 'jspdf';
import inventoryData from './assets/Updated_Inventory_with_Additional_Dry_Items.csv?raw';

const dayTypes = [
  { value: 'WEEKDAYS', label: 'Weekday' },
  { value: 'WEEKENDS', label: 'Weekend' },
  { value: 'LONG WEEKENDS', label: 'Long Weekend' },
];

const currentInventoryOptions = ['Do not order', ...Array.from({ length: 100 }, (_, i) => i)];
const toOrderOptions = Array.from({ length: 100 }, (_, i) => i);

function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return {
      id: values[0],
      name: values[1],
      category: values[2],
      recommended: {
        WEEKDAYS: parseInt(values[3]) || 0,
        WEEKENDS: parseInt(values[4]) || 0,
        'LONG WEEKENDS': parseInt(values[5]) || 0
      }
    };
  }).filter(item => item.name && item.name.trim() !== '');
}

function groupByCategory(items) {
  return items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});
}

function App() {
  const [dayType, setDayType] = useState('');
  const [inventory, setInventory] = useState({});
  const [order, setOrder] = useState({});
  const [applied, setApplied] = useState(false);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [doNotRecommend, setDoNotRecommend] = useState({});
  const [noteDialog, setNoteDialog] = useState({ open: false, item: null, currentNote: '' });
  const [finalNote, setFinalNote] = useState('');
  const [finalNoteDialog, setFinalNoteDialog] = useState(false);

  useEffect(() => {
    const parsedItems = parseCSV(inventoryData);
    setItems(parsedItems);
  }, []);

  const handleDayTypeChange = (e) => {
    setDayType(e.target.value);
    setInventory({});
    setOrder({});
    setApplied(false);
  };

  const handleInventoryChange = (name, value) => {
    setInventory((prev) => ({ ...prev, [name]: value }));
    if (value === 'Do not order') {
      setOrder((prev) => ({ ...prev, [name]: 0 }));
    }
    setApplied(false);
  };

  const handleOrderChange = (name, value) => {
    setOrder((prev) => ({ ...prev, [name]: value === 'Do not order' ? 'Do not order' : value }));
  };

  const handleNoteClick = (item) => {
    setNoteDialog({ 
      open: true, 
      item,
      currentNote: notes[item.name] || ''
    });
  };

  const handleNoteChange = (note) => {
    setNoteDialog(prev => ({ ...prev, currentNote: note }));
  };

  const handleNoteSave = () => {
    setNotes(prev => ({ ...prev, [noteDialog.item.name]: noteDialog.currentNote }));
    setNoteDialog({ open: false, item: null, currentNote: '' });
  };

  const handleDoNotRecommend = (name) => {
    setDoNotRecommend(prev => {
      const newState = { ...prev, [name]: !prev[name] };
      if (newState[name]) {
        setOrder(prev => ({ ...prev, [name]: inventory[name] || 0 }));
      } else {
        setOrder(prev => ({ ...prev, [name]: '' }));
      }
      return newState;
    });
  };

  const handleFinalNoteSave = (note) => {
    setFinalNote(note);
    setFinalNoteDialog(false);
  };

  const handleApply = () => {
    const newOrder = {};
    items.forEach((item) => {
      if (inventory[item.name] === 'Do not order') {
        newOrder[item.name] = 0;
      } else if (doNotRecommend[item.name]) {
        newOrder[item.name] = inventory[item.name] || 0;
      } else {
        const have = parseFloat(inventory[item.name]) || 0;
        const needed = item.recommended[dayType] || 0;
        newOrder[item.name] = Math.max(needed - have, 0);
      }
    });
    setOrder(newOrder);
    setApplied(true);
  };

  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    const grouped = groupByCategory(items);
    let y = 10;
    const pageHeight = 280;
    const margin = 10;
    const lineHeight = 7;
    const categoryHeight = 8;
    const categorySpacing = 5;

    const categoryNames = {
      'D': 'Dry Goods',
      'G': 'Greens',
      'M': 'Meat',
      'T': 'Other'
    };

    doc.setFontSize(16);
    doc.text('Order List', margin, y);
    y += 7;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    doc.setFontSize(12);
    doc.text(`Date: ${dateStr}`, margin, y);
    y += 7;

    // Add final note if exists
    if (finalNote) {
      doc.setFontSize(12);
      doc.text(`Note: ${finalNote}`, margin, y);
      y += 10;
    }

    Object.keys(grouped).forEach((cat) => {
      const itemsToOrder = grouped[cat].filter((item) => {
        const qty = order[item.name];
        return qty !== undefined && qty !== 'Do not order' && Number(qty) > 0;
      });
      if (itemsToOrder.length === 0) return;

      // Always print the category header
      doc.setFontSize(14);
      doc.text(categoryNames[cat] || cat, margin, y);
      y += categoryHeight;

      doc.setFontSize(11);
      itemsToOrder.forEach((item, idx) => {
        // If not enough space for the next item, add a new page
        if (y + lineHeight > pageHeight) {
          doc.addPage();
          y = 10;
          // Reprint the category header at the top of the new page for context
          doc.setFontSize(14);
          doc.text(categoryNames[cat] || cat, margin, y);
          y += categoryHeight;
          doc.setFontSize(11);
        }
        const qty = order[item.name];
        const note = notes[item.name] ? `, ${notes[item.name]}` : '';
        const text = `${item.name}: ${qty}${note}`;
        doc.text(text, margin + 5, y);
        y += lineHeight;
      });
      y += categorySpacing;
    });

    doc.save(`order-${dateStr}.pdf`);
  };

  return (
    <Box sx={{ p: 2, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom align="center">Inventory Order App</Typography>
      <FormControl fullWidth sx={{ mb: 3 }} size="small">
        <InputLabel id="day-type-label">Type of Day</InputLabel>
        <Select
          labelId="day-type-label"
          value={dayType}
          label="Type of Day"
          onChange={handleDayTypeChange}
        >
          {dayTypes.map((d) => (
            <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
          ))}
        </Select>
      </FormControl>
      {dayType && (
        <Paper sx={{ p: 2, mb: 2, boxShadow: 1 }}>
          <Typography variant="subtitle1" gutterBottom align="center">Enter Current Inventory</Typography>
          {items.map((item) => (
            <Box key={item.name} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography fontSize={15} fontWeight={500}>
                  {item.name} ({item.category === 'D' ? 'Dry Goods' : item.category === 'G' ? 'Greens' : item.category === 'M' ? 'Meat' : item.category})
                </Typography>
              </Box>
              <Typography fontSize={13} color="text.secondary" mb={1}>
                Recommended: {item.recommended[dayType]}
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Current Inventory</InputLabel>
                <Select
                  value={inventory[item.name] !== undefined ? inventory[item.name] : ''}
                  label="Current Inventory"
                  onChange={e => handleInventoryChange(item.name, e.target.value)}
                >
                  {currentInventoryOptions.map((qty) => (
                    <MenuItem key={qty} value={qty}>{qty}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>To Order</InputLabel>
                <Select
                  value={order[item.name] !== undefined ? order[item.name] : ''}
                  label="To Order"
                  onChange={e => handleOrderChange(item.name, e.target.value)}
                  disabled={inventory[item.name] === 'Do not order' || doNotRecommend[item.name]}
                >
                  {toOrderOptions.map((qty) => (
                    <MenuItem key={qty} value={qty}>{qty}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ mt: 1 }}>
                <Button
                  fullWidth
                  size="small"
                  onClick={() => handleNoteClick(item)}
                  sx={{ mb: 1 }}
                  color="primary"
                  variant="contained"
                >
                  {notes[item.name] ? 'Edit Note' : 'Add Note'}
                </Button>
                <Button
                  fullWidth
                  size="small"
                  onClick={() => handleDoNotRecommend(item.name)}
                  color={doNotRecommend[item.name] ? 'error' : 'primary'}
                  variant="contained"
                >
                  {doNotRecommend[item.name] ? 'Recommended' : 'Do Not Recommend'}
                </Button>
              </Box>
            </Box>
          ))}
          <Button
            variant="outlined"
            fullWidth
            sx={{ mb: 1 }}
            onClick={() => setFinalNoteDialog(true)}
          >
            {finalNote ? 'Edit Final Note' : 'Add Final Note'}
          </Button>
          <Button variant="contained" fullWidth sx={{ mt: 1, mb: 1 }} onClick={handleApply}>Apply Recommended</Button>
          <Button variant="outlined" fullWidth sx={{ mb: 1 }} onClick={handleGeneratePDF} disabled={!applied}>Generate PDF</Button>
        </Paper>
      )}

      <Dialog open={noteDialog.open} onClose={() => setNoteDialog({ open: false, item: null, currentNote: '' })}>
        <DialogTitle>Add Note for {noteDialog.item?.name}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Note"
            fullWidth
            variant="outlined"
            value={noteDialog.currentNote}
            onChange={(e) => handleNoteChange(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNoteDialog({ open: false, item: null, currentNote: '' })}>Cancel</Button>
          <Button onClick={handleNoteSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Final Note Dialog */}
      <Dialog open={finalNoteDialog} onClose={() => setFinalNoteDialog(false)}>
        <DialogTitle>Final Note</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Final Note"
            fullWidth
            variant="outlined"
            value={finalNote}
            onChange={e => setFinalNote(e.target.value)}
            multiline
            rows={1}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinalNoteDialog(false)}>Cancel</Button>
          <Button onClick={() => handleFinalNoteSave(finalNote)}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
