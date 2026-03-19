import { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, ScatterChart, Scatter, ZAxis, Cell, Legend
} from 'recharts';
import {
    Building, DollarSign, TrendingUp, MapPin, Activity, Hexagon
} from 'lucide-react';
import './App.css';

const StatCard = ({ title, value, icon }) => (
    <div className="glass-card stat-card fade-in">
        <div className="stat-icon">{icon}</div>
        <div className="stat-info">
            <h3>{title}</h3>
            <div className="value">{value}</div>
        </div>
    </div>
);

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="custom-tooltip">
                <p style={{ margin: 0, fontWeight: 'bold' }}>{label}</p>
                {payload.map((entry, index) => (
                    <p key={`item-${index}`} style={{ color: entry.color, margin: '4px 0 0 0' }}>
                        {entry.name}: {entry.name.toLowerCase().includes('price') ? '$' : ''}{Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

const parseCSV = (url) => new Promise((resolve, reject) => {
    Papa.parse(url, { download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: resolve, error: reject });
});

function App() {
    const [dataV6, setDataV6] = useState([]);
    const [dataV2, setDataV2] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            parseCSV('/property_clusters_extremePrice_removed_v6.csv'),
            parseCSV('/final_clean_market_dataset1_v2.csv')
        ]).then(([resV6, resV2]) => {
            setDataV6(resV6.data);
            setDataV2(resV2.data);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, []);

    const analytics = useMemo(() => {
        if (!dataV6.length || !dataV2.length) return null;

        // V6 Processing (Time Series & K-Means Clusters)
        const timeSeriesMap = {};
        const scatterPoints = [];
        dataV6.forEach(item => {
            if (item.YearMonth && item.SalePrice) {
                if (!timeSeriesMap[item.YearMonth]) timeSeriesMap[item.YearMonth] = [];
                timeSeriesMap[item.YearMonth].push(item.SalePrice);
            }
            if (item.TotalFinishedArea > 0 && item.SalePrice > 0 && item.Cluster !== undefined) {
                if (Math.random() > 0.6) { // Sample data for frontend performance
                    scatterPoints.push({ area: item.TotalFinishedArea, price: item.SalePrice, cluster: item.Cluster });
                }
            }
        });

        const getMedian = (arr) => {
            if (!arr.length) return 0;
            const s = [...arr].sort((a,b) => a-b);
            const mid = Math.floor(s.length/2);
            return s.length % 2 !== 0 ? s[mid] : (s[mid-1]+s[mid])/2;
        };

        const tsData = Object.keys(timeSeriesMap).sort().map(ym => ({
            date: ym, originalPrice: getMedian(timeSeriesMap[ym])
        }));
        tsData.forEach((item, i) => {
            if (i >= 2) item.movingAvg = (tsData[i].originalPrice + tsData[i-1].originalPrice + tsData[i-2].originalPrice) / 3;
            else if (i === 1) item.movingAvg = (tsData[i].originalPrice + tsData[i-1].originalPrice) / 2;
            else item.movingAvg = tsData[i].originalPrice;
        });

        // V2 Processing (Bar Charts & Histograms)
        const nhoodMap = {};
        const typeMap = {};
        const logPrices = [];
        const prices = [];
        
        let validPropsV2 = 0;
        let totalValV2 = 0;

        dataV2.forEach(item => {
            validPropsV2++;
            totalValV2 += (item.SalePrice || 0);

            if (item.xrPrimaryNeighborhoodID && item.SalePrice > 0) {
                const nh = item.xrPrimaryNeighborhoodID;
                if (!nhoodMap[nh]) nhoodMap[nh] = { id: nh, total: 0, count: 0 };
                nhoodMap[nh].total += item.SalePrice;
                nhoodMap[nh].count++;
            }
            if (item.AssrLandUse && item.SalePrice > 0) {
                const t = item.AssrLandUse;
                if (!typeMap[t]) typeMap[t] = { name: t, total: 0, count: 0 };
                typeMap[t].total += item.SalePrice;
                typeMap[t].count++;
            }
            if (item.SalePrice > 0) prices.push(item.SalePrice);
            if (item.LogSalePrice > 0) logPrices.push(item.LogSalePrice);
        });

        const topNeighborhoods = Object.values(nhoodMap)
            .map(x => ({ name: String(x.id), avgPrice: x.total / x.count }))
            .sort((a, b) => b.avgPrice - a.avgPrice).slice(0, 10);
            
        const typesDist = Object.values(typeMap).map(x => ({ name: x.name, count: x.count })).sort((a,b) => b.count - a.count);
        const typesAvgPrice = Object.values(typeMap).map(x => ({ name: x.name, avgPrice: x.total / x.count })).sort((a,b) => a.avgPrice - b.avgPrice);

        const createHist = (arr, binsCount = 40) => {
            if (!arr.length) return [];
            let min = Math.min(...arr), max = Math.max(...arr);
            let size = (max - min) / binsCount;
            let bins = Array.from({length: binsCount}, (_, i) => ({
                binMin: min + i*size, count: 0
            }));
            arr.forEach(v => {
                let idx = Math.floor((v-min)/size);
                if(idx >= binsCount) idx = binsCount-1;
                bins[idx].count++;
            });
            return bins.map(b => ({ name: b.binMin > 1000 ? (b.binMin/1000000).toFixed(1)+'M' : b.binMin.toFixed(1), count: b.count }));
        };

        return {
            totalProps: validPropsV2,
            avgPrice: totalValV2 / validPropsV2,
            tsData, scatterPoints, topNeighborhoods, typesDist, typesAvgPrice,
            histPrices: createHist(prices.filter(p=>p<5000000), 40), // cap to remove extreme long tail for viz
            histLogPrices: createHist(logPrices, 40)
        };
    }, [dataV6, dataV2]);

    if (loading) return <div className="loader-container"><div className="spinner"></div><h2 className="gradient-text">Analyzing Datasets...</h2></div>;
    if (!analytics) return <div>Failed to compute analytics.</div>;

    const clusterColors = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

    return (
        <div className="dashboard-layout fade-in">
            <aside className="sidebar">
                <div className="brand gradient-text"><Hexagon size={28} /> RealData Pro</div>
                <nav className="nav-links">
                    <div className="nav-item active"><Activity size={20} /> Market Overview</div>
                    <div className="nav-item"><Building size={20} /> Property Assets</div>
                    <div className="nav-item"><TrendingUp size={20} /> Capital Trends</div>
                    <div className="nav-item"><MapPin size={20} /> Territory Intel</div>
                </nav>
            </aside>

            <main className="main-content">
                <header className="header">
                    <h1>Real Estate Business Analytics</h1>
                    <p>Advanced metrics derived from {analytics.totalProps.toLocaleString()} transactions across v6 and v2 datasets.</p>
                </header>

                <section className="stats-grid">
                    <StatCard title="Total Properties Assessed" value={analytics.totalProps.toLocaleString()} icon={<Building size={24} />} />
                    <StatCard title="Overall Average Asset Price" value={`$${Math.round(analytics.avgPrice).toLocaleString()}`} icon={<DollarSign size={24} />} />
                </section>

                <div className="section-title"><h3>Time Series & Clustering (v6 Dataset)</h3></div>
                <section className="charts-grid-full">
                    <div className="glass-card chart-card">
                        <div className="chart-header">
                            <h2>Smoothed Property Price Trend</h2>
                            <p>Original Median Price vs 3-Month Moving Average over Time</p>
                        </div>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={350}>
                                <LineChart data={analytics.tsData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickMargin={10} minTickGap={30} />
                                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${v/1000}k`} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />
                                    <Line type="monotone" dataKey="originalPrice" name="Original Median Price" stroke="#38bdf8" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="movingAvg" name="3-Month Moving Average" stroke="#f59e0b" strokeWidth={3} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    
                    <div className="glass-card chart-card">
                        <div className="chart-header">
                            <h2>Property Clusters (Outliers Removed)</h2>
                            <p>K-Means Clustering: Sale Price vs Total Finished Area</p>
                        </div>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={350}>
                                <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis type="number" dataKey="area" name="Total Area" unit=" sqft" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                                    <YAxis type="number" dataKey="price" name="Sale Price" unit=" $" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                                    <ZAxis type="number" range={[20, 20]} />
                                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                                    <Scatter name="Assets" data={analytics.scatterPoints}>
                                        {analytics.scatterPoints.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={clusterColors[entry.cluster % clusterColors.length]} fillOpacity={0.8} />
                                        ))}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                <div className="section-title" style={{ marginTop: '2rem' }}><h3>Distributions & Analytics (v2 Dataset)</h3></div>
                
                <section className="charts-grid-full grid-2">
                    <div className="glass-card chart-card">
                        <div className="chart-header"><h2>Sale Price Distribution</h2></div>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={analytics.histPrices} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="count" fill="#3b82f6" name="Properties" radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    
                    <div className="glass-card chart-card">
                        <div className="chart-header"><h2>Log Sale Price Distribution</h2></div>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={analytics.histLogPrices} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="count" fill="#3b82f6" name="Properties" radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                <section className="charts-grid-full" style={{ marginTop: '2rem' }}>
                    <div className="glass-card chart-card">
                        <div className="chart-header">
                            <h2>Top 10 Neighborhoods by Average Sale Price</h2>
                        </div>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart data={analytics.topNeighborhoods} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="avgPrice" fill="#14b8a6" name="Avg Sale Price" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                <section className="charts-grid-full grid-2" style={{ marginTop: '2rem' }}>
                    <div className="glass-card chart-card">
                        <div className="chart-header"><h2>Property Type Distribution</h2></div>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart data={analytics.typesDist.slice(0, 10)} margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="name" stroke="#94a3b8" angle={-45} textAnchor="end" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="count" fill="#8b5cf6" name="Count" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="glass-card chart-card">
                        <div className="chart-header"><h2>Average Sale Price by Property Type</h2></div>
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart data={analytics.typesAvgPrice.slice(0, 10)} margin={{ top: 10, right: 10, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="name" stroke="#94a3b8" angle={-45} textAnchor="end" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="avgPrice" fill="#8b5cf6" name="Avg Sale Price" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default App;
