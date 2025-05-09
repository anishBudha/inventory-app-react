import { useState, useEffect } from 'react';
import { Button, MenuItem, Select, InputLabel, FormControl, Typography, Paper, Box, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import inventoryData from './assets/Updated_Inventory_with_Additional_Dry_Items.csv?raw';

const dayTypes = [
  { value: 'WEEKDAYS', label: 'Weekday' },
  { value: 'WEEKENDS', label: 'Weekend' },
  { value: 'LONG WEEKENDS', label: 'Long Weekend' },
];

const currentInventoryOptions = ['Do not order', ...Array.from({ length: 100 }, (_, i) => i)];
const toOrderOptions = Array.from({ length: 100 }, (_, i) => i);
const recommendedOptions = Array.from({ length: 101 }, (_, i) => i);

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

function getSavedRecommendations() {
  try {
    const saved = localStorage.getItem('customRecommendations');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveRecommendations(recs) {
  localStorage.setItem('customRecommendations', JSON.stringify(recs));
}

function SetupPage({ items, onBack }) {
  const [recommendations, setRecommendations] = useState(() => getSavedRecommendations());

  useEffect(() => {
    saveRecommendations(recommendations);
  }, [recommendations]);

  const handleChange = (itemName, dayType, value) => {
    setRecommendations(prev => ({
      ...prev,
      [itemName]: {
        ...prev[itemName],
        [dayType]: value
      }
    }));
  };

  return (
    <Box sx={{ p: 2, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom align="center">Setup Recommended Quantities</Typography>
      <Button variant="outlined" sx={{ mb: 2 }} onClick={onBack}>Back to App</Button>
      <Paper sx={{ p: 2 }}>
        {items.map(item => (
          <Box key={item.name} sx={{ mb: 3 }}>
            <Typography fontWeight={500} sx={{ mb: 1 }}>{item.name}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dayTypes.map(dt => (
                <FormControl key={dt.value} size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>{dt.label}</InputLabel>
                  <Select
                    value={
                      (recommendations[item.name]?.[dt.value] !== undefined)
                        ? recommendations[item.name][dt.value]
                        : item.recommended[dt.value]
                    }
                    label={dt.label}
                    onChange={e => handleChange(item.name, dt.value, e.target.value)}
                  >
                    {recommendedOptions.map(opt => (
                      <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ))}
            </Box>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

function App() {
  const [page, setPage] = useState('landing');
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
  // Password lock state
  const [setupPasswordDialog, setSetupPasswordDialog] = useState(false);
  const [setupPasswordInput, setSetupPasswordInput] = useState('');
  const [setupPasswordError, setSetupPasswordError] = useState('');
  // Password lock for Excel export
  const [excelPasswordDialog, setExcelPasswordDialog] = useState(false);
  const [excelPasswordInput, setExcelPasswordInput] = useState('');
  const [excelPasswordError, setExcelPasswordError] = useState('');

  useEffect(() => {
    const parsedItems = parseCSV(inventoryData);
    setItems(parsedItems);
  }, []);

  // Use custom recommendations if set
  const getItemRecommended = (item, type) => {
    const custom = getSavedRecommendations();
    return (custom[item.name] && custom[item.name][type] !== undefined)
      ? custom[item.name][type]
      : item.recommended[type];
  };

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

  const handleGenerateFullInventoryExcel = () => {
    const data = items.map(item => ({
      Item: item.name,
      'Current Inventory': inventory[item.name] !== undefined ? inventory[item.name] : '',
      'To Order': order[item.name] !== undefined ? order[item.name] : ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Full Inventory');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    XLSX.writeFile(wb, `full-inventory-${dateStr}.xlsx`);
  };

  const handleExcelExportClick = () => {
    setExcelPasswordDialog(true);
    setExcelPasswordInput('');
    setExcelPasswordError('');
  };
  const handleExcelPasswordSubmit = () => {
    const correctPassword = 'agora123';
    if (excelPasswordInput === correctPassword) {
      setExcelPasswordDialog(false);
      handleGenerateFullInventoryExcel();
    } else {
      setExcelPasswordError('Incorrect password');
    }
  };

  const handleApply = () => {
    const newOrder = { ...order };
    items.forEach((item) => {
      if (newOrder[item.name] === undefined || newOrder[item.name] === '') {
        if (inventory[item.name] === 'Do not order') {
          newOrder[item.name] = 0;
        } else {
          const have = parseFloat(inventory[item.name]) || 0;
          const needed = getItemRecommended(item, dayType) || 0;
          newOrder[item.name] = Math.max(needed - have, 0);
        }
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

  // Password check for setup page
  const handleSetupPageClick = () => {
    setSetupPasswordDialog(true);
    setSetupPasswordInput('');
    setSetupPasswordError('');
  };
  const handleSetupPasswordSubmit = () => {
    const correctPassword = 'agora123'; // Change as needed
    if (setupPasswordInput === correctPassword) {
      setSetupPasswordDialog(false);
      setPage('setup');
    } else {
      setSetupPasswordError('Incorrect password');
    }
  };

  if (page === 'landing') {
    return (
      <Box sx={{ p: 2, maxWidth: 600, mx: 'auto', textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>Inventory App</Typography>
        <Button variant="contained" sx={{ m: 2 }} onClick={() => setPage('main')}>Go to Main App</Button>
        <Button variant="outlined" sx={{ m: 2 }} onClick={handleSetupPageClick}>Go to Setup Page</Button>
        <Dialog open={setupPasswordDialog} onClose={() => setSetupPasswordDialog(false)}>
          <DialogTitle>Enter Setup Page Password</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Password"
              type="password"
              fullWidth
              variant="outlined"
              value={setupPasswordInput}
              onChange={e => setSetupPasswordInput(e.target.value)}
              error={!!setupPasswordError}
              helperText={setupPasswordError}
              onKeyDown={e => { if (e.key === 'Enter') handleSetupPasswordSubmit(); }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSetupPasswordDialog(false)}>Cancel</Button>
            <Button onClick={handleSetupPasswordSubmit}>Submit</Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  if (page === 'setup') {
    return <SetupPage items={items} onBack={() => setPage('landing')} />;
  }

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
                Recommended: {getItemRecommended(item, dayType)}
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
                  disabled={inventory[item.name] === 'Do not order'}
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
          <Button variant="outlined" fullWidth sx={{ mb: 1 }} onClick={handleExcelExportClick}>Generate Full Inventory Excel</Button>
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
            rows={4}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinalNoteDialog(false)}>Cancel</Button>
          <Button onClick={() => handleFinalNoteSave(finalNote)}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={excelPasswordDialog} onClose={() => setExcelPasswordDialog(false)}>
        <DialogTitle>Enter Password to Export Excel</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Password"
            type="password"
            fullWidth
            variant="outlined"
            value={excelPasswordInput}
            onChange={e => setExcelPasswordInput(e.target.value)}
            error={!!excelPasswordError}
            helperText={excelPasswordError}
            onKeyDown={e => { if (e.key === 'Enter') handleExcelPasswordSubmit(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExcelPasswordDialog(false)}>Cancel</Button>
          <Button onClick={handleExcelPasswordSubmit}>Submit</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
