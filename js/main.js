Promise.all([
  d3.csv("data/votos.csv"),
  d3.csv("data/cupos.csv"),
  d3.json("data/alianzas.json"),
  d3.json("data/partidos.json")
]).then(function(data){

  const votos = data[0],
    cupos = data[1],
    alianzas = data[2],
    partidos = data[3];

  const partidosDict = {},
    alianzasDict = {};
  
  partidos.forEach(partido => {
    let colorFill = d3.color(partido.color);
    colorFill.opacity = 0.5;
    partidosDict[partido.nombre] = {
      "colorFill": colorFill,
      "colorStroke": d3.color(partido.color),
      "nombreCorto": partido.nombreCorto
    }
  });

  let overCircle = null;

  votos.forEach(d => {
    d.partido = d.partido.trim();
    d.votos = +d.votos;
  });

  cupos.forEach(cupo => {
    cupo.cupos = +cupo.cupos;
  })

  const width = 1000,
    height = 300;

  const margin = {"top": 20};

  const stdY = height / 2;

  const svg = d3.select("#viz")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("font", "10px sans-serif")
    .attr("text-anchor", "middle");

  function updatePlot(alianzasData) {

    // D'Hondt
    const mostVotes = cupos.map(cupo => {

      // Calculate votes per alianza for each region
      const alianzaVotes = alianzasData.map(alianza => {
        const votosAlianza = votos.filter(voto => (voto.region === cupo.region) & (alianza.partidos.includes(voto.partido)))
          .reduce((a,b) => a + b.votos, 0);

        return {
          "nombre": alianza.nombre,
          "votosTotales": votosAlianza
        }
      });

      // Simulates D'Hondt voting by diving alianza votes per number of seats
      const allVotes = alianzaVotes.map(alianza => {
        return d3.range(1, cupo.cupos + 1).map(idx => {
            return {
              "nombre": alianza.nombre,
              "votos": alianza.votosTotales / idx
            }
          })
      }).flat();

      // Select the most voted based on number of seats
      return allVotes.sort((a,b) => b.votos - a.votos).slice(0, cupo.cupos);
    }).flat();

    alianzasData.forEach(alianza => {
      alianza.votosTotales = votos.filter(voto => alianza.partidos.includes(voto.partido))
        .reduce((a,b) => a + b.votos, 0);
      alianza.nRepresentantes = mostVotes.filter(vote => alianza.nombre === vote.nombre).length;
      alianzasDict[alianza.nombre] = {
        "color": alianza.color,
        "votosTotales": alianza.votosTotales,
        "nRepresentantes": alianza.nRepresentantes
      }
    });

    const circlesData = {
      "name": "All",
      "children": alianzasData.map(alianza => {
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

    const pack = data =>
      d3.pack()
        .size([width - 2, height - 2])
        .padding(3)(
          d3
            .hierarchy(data)
            .sum(d => d.value)
        );

    const gScale = d3
      .scalePoint()
      .padding(0.5)
      .domain(d3.map(alianzasData, (d) => d.nombre))
      .range([0, width]);

    const root = pack(circlesData);

    const mainnodes = root.descendants().filter((d) => d.height == 1);

    const alianzasCircles = root.descendants().filter((d) => d.height == 1);

    const maxRadius = d3.max(alianzasCircles, d => d.r);

    const widthPadding = maxRadius * 2 / 3;

    const widthBand = d3.sum(mainnodes, (d) => d.r * 2 + widthPadding);

    const rScale = d3.scaleLinear().domain([0, widthBand]).range([0, width]);

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
        updatePlot(alianzas);
      }
    }

    const outerNodes = svg
      .selectAll(".outer-circle")
      .data(alianzasCircles)
      .join("circle")
      .attr("class", "outer-circle")
      .attr("r", (d) => rScale(d.r))
      .attr("fill", (d) => "none")
      .attr("stroke", d => alianzasDict[d.data.name].color)
      .attr("opacity", 0.8)
      .attr("stroke-width", 1.5)
      .attr("cx", d => gScale(d.data.name))
      .attr("cy", stdY);

    const innerNodes = svg
      .selectAll(".inner-circle")
      .data(alianzasCircles.map(d => d.children).flat())
      .join("circle")
      .attr("class", "inner-circle")
      .attr("r", (d) => rScale(d.r))
      .attr("fill", (d) => partidosDict[d.data.name].colorFill)
      .attr("opacity", 0.5)
      .attr("stroke", d => partidosDict[d.data.name].colorStroke)
      .attr("stroke-width", 1.5)
      .attr("cx", (d) => gScale(d.parent.data.name) + rScale(d.x - d.parent.x))
      .attr("cy", (d) => stdY + rScale(d.y - d.parent.y))
      .attr("transform", `translate(0,0)`)
      .call(drag);

    const fontSize = 24;

    const innerText = svg
      .selectAll(".inner-circle-label")
      .data(alianzasCircles.map(d => d.children).flat())
      .join("text")
      .attr("class", "inner-circle-label")
      .attr("fill", (d) => partidosDict[d.data.name].colorStroke)
      .style("font-size", d => d3.min([fontSize, rScale(d.r)*2/3]))
      .style("font-weight", 700)
      .attr("dominant-baseline", "middle")
      .attr("x", (d) => gScale(d.parent.data.name) + rScale(d.x - d.parent.x))
      .attr("y", (d) => stdY + rScale(d.y - d.parent.y))
      .attr("transform", `translate(0,0)`)
      .text(d => partidosDict[d.data.name].nombreCorto);

    svg.selectAll(".labels").remove();

    const gAxis = svg
      .append("g")
      .attr("class", "labels")
      .call(d3.axisTop(gScale))
      .call((g) => {
        g.select(".domain").remove();
        g.selectAll(".tick line").remove();
        g.selectAll("text")
          .attr("fill", d => alianzasDict[d].color)
        g.selectAll(".tick").append("text")
          .attr("class", "representantes-labels")
          .attr("fill", d => alianzasDict[d].color)
          .attr("dy", 2)
          .text(d => alianzasDict[d].nRepresentantes + ' representantes');
        g.selectAll(".tick").append("text")
          .attr("class", "votos-labels")
          .attr("fill", d => alianzasDict[d].color)
          .attr("dy", 12)
          .text(d => alianzasDict[d].votosTotales + ' votos');
      });

    gAxis.attr("transform", `translate(0, ${height / 2 - rScale(maxRadius) - 20})`);
  }

  updatePlot(alianzas);

})
