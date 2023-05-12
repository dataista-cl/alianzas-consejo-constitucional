Promise.all([
  d3.csv("data/votos.csv"),
  d3.csv("data/cupos.csv"),
  d3.json("data/alianzas.json")
]).then(function(data){

  const votos = data[0],
    cupos = data[1],
    alianzas = data[2];

  let overCircle;

  votos.forEach(d => {
    d.partido = d.partido.trim();
    d.votos = +d.votos;
  })

  console.log(votos, cupos, alianzas);

  const circlesData = {
    "name": "All",
    "children": alianzas.map(alianza => {
        return {
          "name": alianza.nombre,
          "children": alianza.partidos.map(partido => {
            return {
              "name": partido,
              "value": votos.filter(voto => voto.partido === partido).reduce((a,b) => a + b.votos, 0)
            }
          })
        }
    })
  };

  console.log(circlesData);

  const width = 1000,
    height = 300;
  
  const margin = {"top": 20};

  const widthPadding = 40;

  const pack = data =>
    d3.pack()
      .size([width - 2, height - 2])
      .padding(3)(
        d3
          .hierarchy(data)
          .sum(d => d.value)
      );

  const root = pack(circlesData);

  const mainnodes = root.descendants().filter((d) => d.height == 1);

  const widthBand = d3.sum(mainnodes, (d) => d.r * 2 + widthPadding);

  const stdY = height / 2;

  const rScale = d3.scaleLinear().domain([0, widthBand]).range([0, width]);

  const gScale = d3
    .scalePoint()
    .padding(0.5)
    .domain(d3.map(mainnodes, (d) => d.data.name))
    .range([0, width]);

  const svg = d3.select("#viz")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("font", "10px sans-serif")
    .attr("text-anchor", "middle");

  const alianzasCircles = root.descendants().filter((d) => d.height == 1);

  const maxRadius = d3.max(alianzasCircles, d => d.r);

  const drag = d3.drag()
    .on("start", startDragging)
    .on("drag", dragCircle)
    .on("end", endDragging);

  function dragCircle(event, d) {
    const [x, y] = d3.pointer(event, svg.node());
    d3.select(this)
      .attr("transform", `translate(${x - gScale(d.parent.data.name)},${y - stdY})`);
    overCircle = overDragCircles(x, y);
    if (overCircle !== null) {
      outerNodes.filter(d => d.data.name === overCircle.data.name).attr("stroke", "black");
    } else {
      outerNodes.attr("stroke", "#BBB");
    }
  }
  
  function overDragCircles(x, y) {
    let thisCircle = null;
    alianzasCircles.forEach(circle => {
      if (Math.pow(x - gScale(circle.data.name), 2) + Math.pow(y - stdY, 2) <= Math.pow(rScale(circle.r), 2)) {
        thisCircle = circle;
      }
    });
    return thisCircle;
  }
  
  function startDragging(event) {
    d3.select(this)
      .raise();
  }
  
  function endDragging(event, d) {
    if (overCircle === null) {
      d3.select(this)
        .transition(100)
        .attr("transform", `translate(0,0)`);
    } else {
      alianzas.forEach(alianza => {
        if (alianza.partidos.includes(d.data.name)) {
          let index = alianza.partidos.indexOf(d.data.name);
          alianza.partidos.splice(index, 1);
        }
      });
      alianzas.filter(alianza => alianza.nombre === overCircle.data.name)[0].partidos.push(d.data.name);
      console.log(alianzas);
    }
  }


  const outerNodes = svg
    .selectAll(".outer-circle")
    .data(alianzasCircles)
    .join("circle")
    .attr("class", "outer-circle")
    .attr("r", (d) => rScale(d.r))
    .attr("fill", (d) => "none")
    .attr("stroke", d => "#BBB")
    .attr("stroke-width", 1.5)
    .attr("cx", d => gScale(d.data.name))
    .attr("cy", stdY);

  const innerNodes = svg
    .selectAll(".inner-circle")
    .data(alianzasCircles.map(d => d.children).flat())
    .join("circle")
    .attr("class", "inner-circle")
    .attr("r", (d) => rScale(d.r))
    .attr("fill", (d) => "steelblue")
    .attr("cx", (d) => gScale(d.parent.data.name) + rScale(d.x - d.parent.x))
    .attr("cy", (d) => stdY + rScale(d.y - d.parent.y))
    .call(drag);

  const gAxis = svg
    .append("g")
    .call(d3.axisTop(gScale))
    .call((g) => {
      g.select(".domain").remove();
      g.selectAll(".tick line").remove();
    });

  gAxis.attr("transform", `translate(0, ${height / 2 - rScale(maxRadius) - 10})`);

  return svg.node();
})
